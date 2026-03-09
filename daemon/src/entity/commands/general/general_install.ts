import fs from "fs-extra";
import path from "path"; // 新增：用於處理路徑拼接
import { $t } from "../../../i18n";
import { QuickInstallTask } from "../../../service/async_task_service/quick_install";
import Instance from "../../instance/instance";
import InstanceCommand from "../base/command";

export default class GeneralInstallCommand extends InstanceCommand {
  private installTask?: QuickInstallTask;

  constructor() {
    super("GeneralInstallCommand");
  }

  private stopped(instance: Instance) {
    instance.asynchronousTask = undefined;
    instance.setLock(false);
    instance.status(Instance.STATUS_STOP);
  }

  async exec(instance: Instance, params?: IQuickStartPackages) {
    if (instance.status() !== Instance.STATUS_STOP)
      return instance.failure(new Error($t("TXT_CODE_general_update.statusErr_notStop")));
    if (instance.asynchronousTask)
      return instance.failure(new Error($t("TXT_CODE_general_update.statusErr_otherProgress")));
    if (!params) throw new Error("GeneralInstallCommand: No params");
    
    try {
      instance.setLock(true);
      instance.status(Instance.STATUS_BUSY);
      
      // 輸出提示訊息
      instance.println($t("TXT_CODE_1704ea49"), $t("TXT_CODE_cbc235ad"));

      if (instance.hasCwdPath()) {
        const cwd = instance.absoluteCwdPath();
        const backupDirName = "LazyCloud_backup"; // 定義要保護的目錄名

        // 檢查路徑是否存在
        if (await fs.pathExists(cwd)) {
          // 讀取當前目錄下的所有檔案和資料夾
          const items = await fs.readdir(cwd);
          
          for (const item of items) {
            // 如果是備份目錄，則跳過
            if (item === backupDirName) {
              instance.println("INFO", `[LazyCloud] 保護備份目錄: ${item}，不執行刪除。`);
              continue;
            }
            
            // 執行遞迴刪除其他檔案
            await fs.remove(path.join(cwd, item));
          }
        } else {
          // 如果目錄根本不存在，則創建它
          await fs.mkdirs(cwd);
        }
      }

      instance.println($t("TXT_CODE_1704ea49"), $t("TXT_CODE_906c5d6a"));
      
      this.installTask = new QuickInstallTask(
        instance.config.nickname,
        params.targetLink,
        params.setupInfo,
        instance
      );
      
      instance.asynchronousTask = this;
      instance.println($t("TXT_CODE_1704ea49"), $t("TXT_CODE_b9ca022b"));
      
      await this.installTask?.start();
      await this.installTask?.wait();
    } catch (err: any) {
      instance.println(
        $t("TXT_CODE_general_update.update"),
        $t("TXT_CODE_general_update.error", { err })
      );
    } finally {
      this.stopped(instance);
    }
  }

  async stop(instance: Instance): Promise<void> {
    instance.println(
      $t("TXT_CODE_general_update.update"),
      $t("TXT_CODE_general_update.killProcess")
    );
    this.stopped(instance);
    await this.installTask?.stop();
    this.installTask = undefined;
  }
}
