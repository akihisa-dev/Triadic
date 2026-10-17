import { type AutoSave, type AutoSaveState } from "../core/autoSave";
import { StatusNotice } from "./StatusNotice";
import "./AutoSaveStatus.css";

export function AutoSaveStatus<T>({ state, controller, onPrepareSave, onLocateInputError }: {
  state: AutoSaveState<T>; controller: AutoSave<T>; onPrepareSave: () => Promise<void>; onLocateInputError?: (() => void) | undefined;
}) {
  return <StatusNotice
    message={state.error ? `自動保存できませんでした。${state.error} 入力内容は残っています。` : ""}
    error
    actions={<div className="auto-save-recovery">
      {onLocateInputError && <button className="text-button" type="button" disabled={state.saving} onClick={onLocateInputError}>入力エラーの場所へ移動</button>}
      <button className="text-button" type="button" disabled={!state.error || state.saving} onClick={() => {
        void onPrepareSave().then(() => controller.flush()).catch(error => controller.fail(error));
      }}>保存を再試行</button>
      <button className="text-button" type="button" disabled={!state.pending || state.saving} onClick={() => controller.discard()}>入力を取り消す</button>
    </div>}
  />;
}
