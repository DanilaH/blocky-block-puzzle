"""Build a self-contained visual replay from checked D81 data, no external assets."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'docs/qa/geometry-recovery'
data = json.loads((OUT/'results.json').read_text())
checks = json.loads((OUT/'checks-public.json').read_text())
compact = dict(routes=data['routes'], episodes=data['episodes'], access=checks['accessibility'],
              shapes=json.loads((ROOT/'src/core/shapes.json').read_text()))
for e in compact['episodes']:
    for event in e['events']:
        event.pop('options', None)
html = r'''<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Блочный пазл — восстановление поля D81</title>
<style>
:root{color-scheme:dark;font:16px/1.45 system-ui;background:#101826;color:#eaf0f8}*{box-sizing:border-box}
body{margin:0}main{max-width:1180px;margin:auto;padding:28px 20px}h1{font-size:26px;margin:0 0 10px}h2{font-size:18px;min-height:52px}
p{color:#b7c5d8;max-width:900px}a{color:#9bd7ff}.controls{display:flex;gap:16px;flex-wrap:wrap;align-items:end;background:#1b283b;padding:16px;border-radius:12px}
label{display:grid;gap:6px;font-size:14px}select,button{background:#293d57;color:inherit;border:1px solid #48607c;border-radius:7px;padding:10px;font:inherit;min-height:44px}
button{cursor:pointer}input{accent-color:#68bcff}input[type=range]{width:260px;max-width:70vw;min-height:30px}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:22px}.card{min-width:0;background:#192639;border:1px solid #304560;border-radius:12px;padding:16px}
.board{display:grid;grid-template-columns:repeat(8,1fr);aspect-ratio:1;gap:3px;background:#0c1522;padding:5px;border-radius:7px;margin:12px 0}
.cell{background:#26364c;border-radius:3px;aspect-ratio:1}.occupied{background:#c1a16b;box-shadow:inset 0 2px #dec492}.new{background:#71c7ff;box-shadow:inset 0 2px #c7ecff}.clear{outline:2px solid #9be2a4;outline-offset:-2px}
.meta{min-height:88px;color:#cad8e8;font-size:14px}.badge{color:#a9deae;font-weight:600}.warning{color:#ffd394}.legend{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;margin:18px 0}
.tray{display:flex;justify-content:space-around;min-height:68px;margin:10px 0}.piece{display:grid;gap:2px;align-content:center;justify-content:center}.piece.used{opacity:.3}.tile{width:10px;height:10px;border-radius:2px}.tile.filled{background:#71c7ff}.piece.current{outline:1px solid #71c7ff;outline-offset:4px;border-radius:3px}
.legend span::before{content:'';display:inline-block;width:12px;height:12px;margin-right:6px;background:#c1a16b}.legend span:nth-child(2)::before{background:#71c7ff}.legend span:nth-child(3)::before{background:#9be2a4}
footer{font-size:13px;color:#9cadc5;border-top:1px solid #304560;margin-top:24px;padding-top:15px}.unknown{color:#ffd394}
@media(max-width:800px){.cards{grid-template-columns:1fr}.card{max-width:480px;width:100%;margin:auto}main{padding:20px 12px}.meta{min-height:0}h2{min-height:0}}
</style><main>
<h1>Восстановление поля: путь и реальные отклонения</h1>
<p>На 29 из 31 поздних инженерных полей найдены очистки за 5–9 ходов. Бот с теми же тройками редко следует им. Здесь можно сравнить точный маршрут, прежнего неточного бота и перепланирование после каждой тройки.</p>
<div class="controls"><label>Исходное поле<select id="position"></select></label>
<label>Выбор неточного бота<select id="quantile"><option value="0">0 — лучший локальный</option><option value="0.25">0,25</option><option value="0.5">0,5</option><option value="0.75">0,75</option><option value="0.999999">1 — крайний разумный</option></select></label>
<label>Ход <output id="number">0 / 9</output><input id="step" type="range" min="0" max="9" value="0"></label>
<button id="play">Проиграть</button><label><span>До удаления линий</span><input id="before" type="checkbox" checked></label></div>
<div class="legend"><span>Прежние клетки</span><span>Установленная фигура</span><span>Очищаемые линии</span></div>
<p id="context"></p><div class="cards" id="cards"></div>
<footer>Это инженерная проба на связанных полях четырёх бот-партий. Пять вариантов выбора не являются независимыми людьми или оценкой вероятности. «Поиск не нашёл» при горизонте 6/9 означает unknown. APK остаётся 0.63; алгоритм в игре не включён.</footer>
</main><script>const D=__DATA__;
const $=id=>document.getElementById(id),shapes=new Map(D.shapes.map(s=>[s.id,s])),
names={reward:'Полная очистка',horizon:'9 ходов без награды',dead:'Нет места оставшейся фигуре',
'construction-unknown':'Поиск не нашёл продолжение в оставшийся срок',
'no-reward-within-horizon':'За оставшиеся 3 хода очистки нет (точный поиск)'};
let timer;
D.routes.forEach((r,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${i+1}. Seed ${r.seed}, ход ${r.move}${r.status==='found'?'':' — путь не найден'}`;$('position').append(o)});
function draw(title,route,events,status,isWitness=false,deals=[]){
 const requested=Number($('step').value),n=Math.min(requested,events.length),event=events[n-1],prior=n>1?events[n-2].rows:route.rows;
 let rows=n?event.rows:route.rows,added=new Set(),lineRows=new Set(),lineCols=new Set();
 if(n&&$('before').checked){rows=[...prior];const s=shapes.get(event.shapeId);for(const[dx,dy]of s.cells){rows[event.y+dy]|=1<<(event.x+dx);added.add((event.y+dy)*8+event.x+dx)}
 for(let y=0;y<8;y++)if(rows[y]===255)lineRows.add(y);for(let x=0;x<8;x++)if(rows.every(r=>r&(1<<x)))lineCols.add(x)}
 const card=document.createElement('article');card.className='card';const h=document.createElement('h2');h.textContent=title;card.append(h);
 const board=document.createElement('div');board.className='board';board.setAttribute('aria-label',title+', ход '+n);
 for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=document.createElement('div');c.className='cell'+(rows[y]&(1<<x)?' occupied':'')+(added.has(y*8+x)?' new':'')+(lineRows.has(y)||lineCols.has(x)?' clear':'');board.append(c)}card.append(board);
 const meta=document.createElement('div');meta.className='meta';let lines=events.slice(0,n).reduce((a,e)=>a+e.lines,0);
 let text=`Ходов: ${n}. Линий: ${lines}. `;
 if(event)text+=`Последний: ${event.shapeId}, (${event.x}, ${event.y}), линий ${event.lines}. `;
 const earned=events.slice(0,n).some(e=>e.clear);
 if(earned)text+='Полная очистка получена. ';
 if(isWitness&&event?.padding)text+='Добавленная одиночная фигура после доказанной награды. ';
 if(requested>=events.length&&!isWitness)text+=names[status]||status;
 if(isWitness&&n&&!event.padding){const a=D.access.find(a=>a.input===Number($('position').value)).choices[n-1];if(a)text+=a.withinBounded?'Ход входит в разумные варианты бота. ':`Ход вне разумных вариантов бота; место ${a.rank} в локальной оценке.`}
 meta.textContent=text;
 const tray=document.createElement('div');tray.className='tray';tray.setAttribute('aria-label','Текущая тройка');
 const group=Math.floor(Math.max(0,n-1)/3),slots=isWitness?route.trays[group]:deals[group]?.tray;
 if(slots)slots.forEach((slot,i)=>{const s=shapes.get(slot.shapeId),piece=document.createElement('div');piece.className='piece';piece.title=slot.shapeId;piece.style.gridTemplateColumns=`repeat(${s.width},10px)`;
 const start=group*3;for(let j=start;j<n;j++){const usedSlot=isWitness?[2,0,1].indexOf(j%3):events[j].slot;if(usedSlot===i)piece.classList.add('used')}
 if(n&&(isWitness?[2,0,1].indexOf((n-1)%3):event.slot)===i)piece.classList.add('current');
 for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const tile=document.createElement('div');tile.className='tile'+(s.cells.some(([dx,dy])=>dx===x&&dy===y)?' filled':'');piece.append(tile)}tray.append(piece)});
 card.append(tray,meta);return card;
}
function render(){const i=Number($('position').value),r=D.routes[i],q=Number($('quantile').value);$('number').textContent=$('step').value+' / 9';$('cards').replaceChildren();
 if(r.status!=='found'){$('context').textContent='Для этого поля ограниченный поиск не нашёл маршрут. Это не доказательство невозможности.';return}
 $('context').textContent=`Начало одинаковое в обеих бот-пробах. Показ ${$('before').checked?'поставленной фигуры перед удалением линий':'поля после хода'}. Новый лоток после ходов 3 и 6.`;
 $('cards').append(draw('Точное следование пути',r,r.trace,'witness',true));
 for(const[mode,title]of[['fixed','Те же запланированные тройки'],['rebuild','Новая тройка по фактическому полю']]){const e=D.episodes.find(e=>e.input===i&&e.quantile===q&&e.mode===mode);$('cards').append(draw(title,r,e.events,e.status,false,e.deals))}
}
function stop(){clearInterval(timer);timer=undefined;$('play').textContent='Проиграть'}
for(const id of ['position','quantile','step','before'])$(id).addEventListener('input',()=>{stop();render()});
$('play').addEventListener('click',()=>{if(timer){stop();return}if(Number($('step').value)===9)$('step').value=0;$('play').textContent='Пауза';timer=setInterval(()=>{$('step').value=Number($('step').value)+1;render();if(Number($('step').value)===9)stop()},800)});render();
</script></html>'''
(OUT/'replay.html').write_text(html.replace('__DATA__', json.dumps(compact, separators=(',', ':')).replace('</', '<\\/')))
print(json.dumps(dict(output=str(OUT/'replay.html'), bytes=(OUT/'replay.html').stat().st_size)))
