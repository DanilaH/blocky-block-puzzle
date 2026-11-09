"""Follow exported SyncToken flows in the existing POCO 0.57 clear trace.

No recording, source change or phone connection. Only explicit flow IDs establish
cross-thread dependencies; temporal overlap is labelled separately.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re

WAIT = 'BlockingSequenceRunner::Sequence::RunAllTasks::WaitSyncToken'
EXPECTED_SHA256 = 'f4659252d06609b90ba40aba0f4a265e5e77c745582343850b7bafcce71490d0'


def span_end(e):
    return e['ts'] + e.get('dur', 0)


def overlap(e, low, high):
    return max(0, min(span_end(e), high) - max(e['ts'], low))


def union_duration(spans, low, high):
    intervals = sorted((max(x['ts'], low), min(span_end(x), high))
                       for x in spans if overlap(x, low, high))
    total, end = 0, low
    for a, b in intervals:
        total += max(0, b - max(a, end))
        end = max(end, b)
    return total


def leaves(value, path=''):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from leaves(child, path + '.' + key)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            yield from leaves(child, path + '.' + str(i))
    else:
        yield path, value


def analyze(path):
    raw = path.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == EXPECTED_SHA256, 'This analysis is bound to the verified POCO 0.57 capture'
    trace = json.loads(raw)
    events = trace['traceEvents']
    for i, e in enumerate(events):
        e['_index'] = i
    marks = sorted((e for e in events if e.get('cat') == 'blink.user_timing'),
                   key=lambda e: e['ts'])
    assert len(marks) == 3 and all(e['name'] == 'performance.mark' for e in marks)
    start, at, end = (e['ts'] for e in marks)
    assert 0 < at - start < 1_000_000 and 2_400_000 <= end - at < 2_600_000
    spans = collections.defaultdict(list)
    flows = collections.defaultdict(list)
    names = {}
    for e in events:
        if e.get('ph') == 'X':
            spans[e['pid'], e['tid']].append(e)
        if e.get('ph') in ['s', 'f']:
            assert 'id' in e and not e.get('id2'), 'Unexpected exported flow format'
            flows[e.get('cat'), e['id']].append(e)
        if e.get('ph') == 'M' and e['name'] == 'thread_name':
            names[e['pid'], e['tid']] = e['args']['name']
    assert all(len(xs) == 2 and {e['ph'] for e in xs} == {'s', 'f'}
               for xs in flows.values()), 'Ambiguous or incomplete flow'

    def parents(e):
        return sorted((x for x in spans[e['pid'], e['tid']]
                       if x['ts'] <= e['ts'] < span_end(x)),
                      key=lambda x: x['dur'])

    def packed(e):
        return dict(index=e['_index'], name=e['name'], pid=e['pid'], tid=e['tid'],
                    thread=names.get((e['pid'], e['tid']), 'name not exported'),
                    afterInferredCommitMs=(e['ts'] - at) / 1000,
                    wallMs=e.get('dur', 0) / 1000,
                    reportedThreadCpuMs=e.get('tdur', 0) / 1000)

    def incoming(name, target):
        found = []
        for pair in flows.values():
            a = next(e for e in pair if e['ph'] == 's')
            b = next(e for e in pair if e['ph'] == 'f')
            if (a['name'] == name and b['pid'] == target['pid']
                    and b['tid'] == target['tid'] and b['ts'] == target['ts']):
                assert a['ts'] <= b['ts']
                found.append((a, b))
        assert len(found) <= 1, 'Ambiguous incoming flow'
        return found[0] if found else None

    def task_kind(task):
        children = [x for x in spans[task['pid'], task['tid']]
                    if task['ts'] <= x['ts'] and span_end(x) <= span_end(task)]
        if any(x['name'] == 'SharedImageStub::OnCreateSharedImage' for x in children):
            return 'shared-image-create'
        if any(x['name'] == 'RasterDecoderImpl::DoRasterCHROMIUM' for x in children):
            return 'raster-commands'
        return 'other'

    draws = sorted((e for e in events if e.get('ph') == 'X'
                    and e['name'] == 'DrawFn_DrawGL' and at <= e['ts'] < end),
                   key=lambda e: -e['dur'])[:3]
    assert len(draws) == 3
    result = []
    for draw in draws:
        waits = sorted((e for e in spans[draw['pid'], draw['tid']]
                        if e['name'] == WAIT and draw['ts'] <= e['ts']
                        and span_end(e) <= span_end(draw)), key=lambda e: -e['dur'])
        assert waits and union_duration(waits, draw['ts'], span_end(draw)) == sum(e['dur'] for e in waits)
        details = []
        for wait in waits:
            calls = sorted((e for e in spans[wait['pid'], wait['tid']]
                            if e['name'] == 'SyncToken::Wait'
                            and 0 <= wait['ts'] - span_end(e) <= 1000),
                           key=span_end, reverse=True)
            assert calls, 'Wait has no preceding SyncToken call'
            call = calls[0]
            starts = [e for e in events if e.get('ph') == 's'
                      and e['name'] == 'SyncToken::Wait' and e['pid'] == call['pid']
                      and e['tid'] == call['tid'] and e['ts'] == call['ts']]
            assert len(starts) == 1
            source = starts[0]
            pair = flows[source['cat'], source['id']]
            release_point = next(e for e in pair if e['ph'] == 'f')
            assert source['pid'] == release_point['pid'], 'Sync token is process scoped'
            release_slices = [x for x in parents(release_point)
                              if x['name'] == 'SyncToken::Release' and x['ts'] == release_point['ts']]
            assert len(release_slices) == 1
            assert wait['ts'] <= release_point['ts'] <= span_end(wait)
            ps = parents(release_point)
            producers = [e for e in ps if e['name'] == 'CommandBuffer::Flush']
            assert len(producers) == 1, 'Do not infer an unidentified producer'
            producer = producers[0]
            tasks = [e for e in ps if e['name'] == 'ThreadControllerImpl::RunTask']
            assert len(tasks) == 1
            task = tasks[0]
            raster = [e for e in spans[producer['pid'], producer['tid']]
                      if producer['ts'] <= e['ts'] < release_point['ts']
                      and e['name'] in ['RasterDecoderImpl::DoBeginRasterCHROMIUM',
                                        'RasterDecoderImpl::DoRasterCHROMIUM',
                                        'RasterDecoderImpl::DoEndRasterCHROMIUM']]
            sent = incoming('GpuChannel::Flush', producer)
            assert sent, 'Producer has no exact submission flow'
            origin = sent[0]
            origin_parents = parents(origin)
            before = max(wait['ts'], producer['ts'])
            outer_tasks = sorted((e for e in spans[producer['pid'], producer['tid']]
                                  if e['name'] == 'ThreadControllerImpl::RunTask'
                                  and overlap(e, wait['ts'], before)), key=lambda e:e['ts'])
            for a, b in zip(outer_tasks, outer_tasks[1:]):
                assert span_end(a) <= b['ts'], 'Overlapping service tasks must not be summed'
            grouped = collections.defaultdict(lambda: dict(tasks=0, clippedWallMs=0))
            for e in outer_tasks:
                group = grouped[task_kind(e)]
                group['tasks'] += 1
                group['clippedWallMs'] += overlap(e, wait['ts'], before) / 1000
            coverage = union_duration(outer_tasks, wait['ts'], before)
            schedulers = [e for e in ps if e['name'] == 'Scheduler::RunTask']
            assert len(schedulers) == 1
            ready = incoming('Scheduler::SequenceUnblocked', schedulers[0])
            readiness = None
            if ready:
                point = ready[0]
                parent_tasks = [e for e in parents(point) if e['name'] == 'ThreadControllerImpl::RunTask']
                assert len(parent_tasks) == 1
                prerequisite = parent_tasks[0]
                readiness = dict(flowId=point['id'], event=packed(point),
                                 enclosingTask=packed(prerequisite),
                                 enclosingTaskKind=task_kind(prerequisite),
                                 submissionToReadyMs=(point['ts'] - origin['ts']) / 1000,
                                 readyToRunMs=(schedulers[0]['ts'] - point['ts']) / 1000,
                                 observedUnderRelease=any(x['name'] == 'SyncToken::Release' for x in parents(point)))
            detail = dict(wait=packed(wait), flowId=source['id'],
                          waitRegistrationGapUs=wait['ts']-span_end(call),
                          release=packed(release_slices[0]), producer=packed(producer),
                          producerTaskKind=task_kind(task),
                          producerCommandsBeforeRelease=dict(collections.Counter(e['name'] for e in raster)),
                          submission=dict(flowId=origin['id'], event=packed(origin),
                                          context=[e['name'] for e in origin_parents
                                                   if e['name'] in ['MainFrame.Draw', 'GpuRasterBuffer::Playback',
                                                                    'CanvasRenderingContext2D::FinalizeFrame']],
                                          submissionToProducerStartMs=(producer['ts']-origin['ts'])/1000),
                          readiness=readiness,
                          waitBeforeProducerMs=(before-wait['ts'])/1000,
                          producerUntilSignalMs=(release_point['ts']-before)/1000,
                          signalToResumeMs=(span_end(wait)-release_point['ts'])/1000,
                          precedingServiceTasks=dict(grouped),
                          precedingServiceCoveredWallMs=coverage/1000,
                          precedingServiceUncoveredWallMs=(before-wait['ts']-coverage)/1000)
            assert abs(sum(detail[k] for k in ['waitBeforeProducerMs', 'producerUntilSignalMs', 'signalToResumeMs'])-wait['dur']/1000)<1e-8
            details.append(detail)
        result.append(dict(draw=packed(draw), totalSyncWaitMs=sum(e['dur'] for e in waits)/1000,
                           totalSyncWaitShare=sum(e['dur'] for e in waits)/draw['dur'], waits=details))
    missing = ['layer_id', 'layerId', 'backendNodeId', 'nodeId', 'tile_id', 'resource_id', 'command_buffer_id']
    keys = collections.Counter()
    def key_counts(value):
        if isinstance(value,dict):
            keys.update(value.keys())
            for child in value.values(): key_counts(child)
        elif isinstance(value,list):
            for child in value:key_counts(child)
    for e in events: key_counts(e.get('args', {}))
    empty_args = {}
    for name in ['RasterTask', 'RasterDecoderImpl::DoRasterCHROMIUM',
                 'SharedImageStub::OnCreateSharedImage', 'CanvasRenderingContext2D::FinalizeFrame']:
        xs = [e for e in events if e['name'] == name and e.get('ph') == 'X']
        empty_args[name] = dict(events=len(xs), nonemptyArgs=sum(bool(e.get('args')) for e in xs))
    loss = {key:val for key,val in leaves(trace['metadata']['trace_processor_stats'])
            if re.search(r'pars.*error|packet_loss|dataloss|lost|overwrit|discard|overrun|abi_violations|patches_failed|readaheads_failed',key)}
    assert len(loss)>=25 and all(value==0 for value in loss.values())
    return dict(sourceVersion='0.57.0-preview', sourceCommit='585c4225f8e4355db2b7abb2950da64f6a84dcb4',
                sourceTraceSha256=hashlib.sha256(raw).hexdigest(), sourceTraceBytes=len(raw),
                events=len(events), flowPairs=len(flows), validatedLossCounters=len(loss),
                clockAlignment='Three generic marks inferred by order and 24/2403ms gaps. No per-RAF association claimed.',
                measuredWindowMs=(end-at)/1000,
                selection='Three longest DrawFn_DrawGL slices STARTING inside inferred committed/end marks; pre-clear work excluded.',
                cpuClockCaveat=dict(tdurExceedsWallByOver50us=sum(e.get('tdur',0)>e.get('dur',0)+50 for e in events if e.get('ph')=='X'),
                                   rule='Reported tdur retained as data only; no clipped CPU attribution, CPU utilization or hardware GPU timing inferred.'),
                draws=result,
                identityAvailability=dict(argumentKeys={k:keys[k] for k in missing}, arguments=empty_args,
                                          paintEvents=sum(e['name']=='Paint' for e in events),
                                          filteredNames=sum(e['name']=='FILTERED' for e in events)),
                conclusion='Explicit wait/release flows lead to raster command processing; In callbacks #1 and #3, the longest-wait producer becomes runnable under a release in a shared-image creation task. Exact app effect or DOM/Canvas identity is absent from this export.',
                limitations=['Overlapping queued work is not automatically a prerequisite.',
                             'A GpuChannel flush can submit accumulated work; MainFrame.Draw origin does not identify every raster source.',
                             'Sync token release is a CPU-side ordering signal, not hardware GPU completion.',
                             'Native capture covers only the final baseline, not the successful broad ablations.',
                             'No app code changed and no phone performance improvement established.'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('trace', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = analyze(args.trace)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'flowPairs':result['flowPairs'], 'draws':[
        {'drawMs':x['draw']['wallMs'], 'waitMs':x['totalSyncWaitMs'],
         'majorWaitMs':x['waits'][0]['wait']['wallMs'],
         'beforeProducerMs':x['waits'][0]['waitBeforeProducerMs'],
         'producerUntilSignalMs':x['waits'][0]['producerUntilSignalMs'],
         'precedingServiceTasks':x['waits'][0]['precedingServiceTasks']}
        for x in result['draws']], 'conclusion':result['conclusion']},ensure_ascii=False,indent=2))
