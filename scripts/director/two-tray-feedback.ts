import type {applyMove} from '../../src/core/rules';
import {type EpisodeState,validEpisode} from './two-tray';

type AcceptedMove=NonNullable<ReturnType<typeof applyMove>>;

/** Feed only accepted/persisted moves. A witnessed plan never outlives its goal.
 * This small reducer is separate from the frozen first two-tray experiment. */
export function observeEpisode(episode:EpisodeState,event:AcceptedMove):EpisodeState {
  if(!validEpisode(episode))return {schema:'blocky-two-tray-v1',stage:'done',expectedRows:[],tray:[],witness:[]};
  if(episode.stage==='done'||(!event.allClear&&event.state.status==='playing'))return episode;
  return {schema:'blocky-two-tray-v1',stage:'done',expectedRows:[],tray:[],witness:[]};
}
