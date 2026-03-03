import { $t } from "../../../i18n";
import Instance from "../../instance/instance";
import InstanceCommand from "../base/command";

export default class JavaSwitchCommand extends InstanceCommand {
  constructor() {
    super("JavaSwitchCommand");
  }

  async exec(instance: Instance, params?: any) {
    // 1. 基礎檢查：實例必須停止
    if (instance.status() !== Instance.STATUS_STOP) {
      return instance.failure(new Error($t("請先停止伺服器後再切換 Java 版本")));
    }

    // 2. 獲取參數（前端傳過來的腳本路徑）
    const newCommand = params?.startCommand;
    if (!newCommand) {
      throw new Error("JavaSwitchCommand: Missing startCommand parameter");
    }

    try {
      // 3. 開始執行
      instance.setLock(true);
      instance.status(Instance.STATUS_BUSY);
      instance.println("System", `請稍等`);

      // 4. 直接修改並保存配置 (關鍵：這是內部調用，不受 API 權限限制)
      instance.config.startCommand = newCommand;
      await instance.config.save();

      instance.println("System", "Java 切換成功！");
    } catch (err: any) {
      instance.println("System", `切換失敗: ${err.message}`);
    } finally {
      // 5. 恢復狀態
      instance.asynchronousTask = undefined;
      instance.setLock(false);
      instance.status(Instance.STATUS_STOP);
    }
  }

  async stop(instance: Instance): Promise<void> {
    // 此任務極快，通常不需要實現停止邏輯
  }
}
