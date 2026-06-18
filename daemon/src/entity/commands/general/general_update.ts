import { $t } from "../../../i18n";
import { InstanceUpdateAction } from "../../../service/instance_update_action";
import logger from "../../../service/log";
import Instance from "../../instance/instance";
import InstanceCommand from "../base/command";
import GeneralStartCommand from "../start/general_start";  // 注意路徑，根據你的目錄結構可能是 "../start/general_start"

export default class GeneralUpdateCommand extends InstanceCommand {
  private updateTask?: InstanceUpdateAction;

  constructor() {
    super("GeneralUpdateCommand");
  }

  private stopped(instance: Instance) {
    instance.asynchronousTask = undefined;
    instance.setLock(false);
    instance.status(Instance.STATUS_STOP);
  }

  async exec(instance: Instance) {
    if (instance.status() !== Instance.STATUS_STOP && instance.status() !== Instance.STATUS_BUSY)
      return instance.failure(new Error($t("TXT_CODE_general_update.statusErr_notStop")));
    if (instance.asynchronousTask)
      return instance.failure(new Error($t("TXT_CODE_general_update.statusErr_otherProgress")));

    let shouldAutoStart = true;

    try {
      instance.setLock(true);
      instance.asynchronousTask = this;
      instance.status(Instance.STATUS_BUSY);

      this.updateTask = new InstanceUpdateAction(instance);
      await this.updateTask?.start();
      await this.updateTask?.wait();
    } catch (err: any) {
      shouldAutoStart = false;
      instance.println(
        $t("TXT_CODE_general_update.update"),
        $t("TXT_CODE_general_update.error", { err: err })
      );
    } finally {
      this.stopped(instance);

      if (shouldAutoStart) {
        // 延遲執行，確保更新後的實例狀態完全釋放
        setTimeout(() => {
          const startCmd = new GeneralStartCommand();
          startCmd.exec(instance).catch((startErr: any) => {
            logger.error("Auto-start after update failed:", startErr);
            instance.println("ERROR", $t("TXT_CODE_general_update.autoStartFailed", { err: startErr?.message || startErr }));
          });
        }, 1000);
      }
    }
  }

  async stop(instance: Instance): Promise<void> {
    instance.asynchronousTask = undefined;
    logger.info(
      $t("TXT_CODE_general_update.terminateUpdate", { instanceUuid: instance.instanceUuid })
    );
    instance.println(
      $t("TXT_CODE_general_update.update"),
      $t("TXT_CODE_general_update.terminateUpdate", { instanceUuid: instance.instanceUuid })
    );
    instance.println(
      $t("TXT_CODE_general_update.update"),
      $t("TXT_CODE_general_update.killProcess")
    );
    await this.updateTask?.stop();
    this.updateTask = undefined;
  }
}
