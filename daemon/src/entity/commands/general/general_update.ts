import { $t } from "../../../i18n";  
import { InstanceUpdateAction } from "../../../service/instance_update_action";  
import logger from "../../../service/log";  
import Instance from "../../instance/instance";  
import InstanceCommand from "../base/command";  

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

    let hasError = false; // 新增：用來追蹤更新過程是否發生錯誤

    try {  
      instance.setLock(true);  
      instance.asynchronousTask = this;  
      instance.status(Instance.STATUS_BUSY);  
      this.updateTask = new InstanceUpdateAction(instance);  
      await this.updateTask?.start();  
      await this.updateTask?.wait();  
    } catch (err: any) {  
      hasError = true; // 發生錯誤，標記為 true
      instance.println(  
        $t("TXT_CODE_general_update.update"),  
        $t("TXT_CODE_general_update.error", { err: err })  
      );  
    } finally {  
      // 1. 恢復實體狀態為停止
      this.stopped(instance);  

      // 2. 如果更新過程沒有發生錯誤 (且沒有被手動中斷)，則立即啟動伺服器
      if (!hasError) {
        try {
          instance.println("INFO", $t("TXT_CODE_general_update.update") + " - Starting server..."); // 可選：印出開始啟動的提示
          await instance.execPreset("start");
        } catch (startErr: any) {
          instance.failure(startErr);
        }
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
