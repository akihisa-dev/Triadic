import { WindowSessionHub } from "./WindowSessionHub";
import { registerFileConflictRecovery } from "./fileConflict";

const hub = new WindowSessionHub();
registerFileConflictRecovery(name => hub.recover(name));
const scope = self as unknown as { onconnect: (event: MessageEvent) => void };
scope.onconnect = event => {
  const port = event.ports[0]!;
  const connection = hub.connect(port);
  port.onmessage = message => {
    if (message.data.type === "watch") {
      // A native lifetime lock is released even when a tab crashes or is forcibly closed.
      void navigator.locks.request(message.data.lock as string, () => connection.disconnect());
    } else connection.receive(message.data);
  };
  port.start();
};
