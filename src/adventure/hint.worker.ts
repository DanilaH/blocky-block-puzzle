import { recommend } from "./core";
import { levelFor } from "./levels";
self.onmessage = ({ data }) =>
  postMessage({
    ...data.request,
    move: recommend(
      levelFor(data.state.levelId, data.state.levelVersion),
      data.state,
    ),
  });
