// 根據你提供的層級，回跳三層到 src 根目錄
import { $t } from "../../../i18n";
// 回跳兩層到 entity 找到實例類
import Instance from "../../instance/instance";
// 回跳兩層到 commands 找到基類
import InstanceCommand from "../base/command";

export default class JavaSwitchCommand extends InstanceCommand {
  constructor() {
    super("JavaSwitchCommand");
  }

  async exec(instance: Instance, params?: any) {
    // 檢查狀態
    if (instance.status() !== Instance.STATUS_STOP) {
      return instance.failure(new Error($t("請先停止伺服器後再切換 Java 版本")));
    }

    const newCommand = params?.startCommand;
    if (!newCommand) throw new Error("JavaSwitchCommand: Missing startCommand");

    try {
      instance.setLock(true);
      instance.status(Instance.STATUS_BUSY);
      instance.println("System", `請稍候`);

      // 修改配置
      instance.config.startCommand = newCommand;
      
      // 保存更改
      await instance.save();

      instance.println("System", "Java 切換成功！");
    } catch (err: any) {
      instance.println("System", `切換失敗: ${err.message}`);
    } finally {
      // 恢復狀態
      instance.asynchronousTask = undefined;
      instance.setLock(false);
      instance.status(Instance.STATUS_STOP);
    }
  }

  async stop(instance: Instance): Promise<void> {
    // 此類任務通常瞬間完成，不需額外停止邏輯
  }
}
