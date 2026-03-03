import { $t } from "../../../i18n";
import Instance from "../../instance/instance";
import InstanceCommand from "../base/command";

export default class JavaSwitchCommand extends InstanceCommand {
  constructor() {
    super("JavaSwitchCommand");
  }

  async exec(instance: Instance, params?: any) {
    if (instance.status() !== Instance.STATUS_STOP) {
      return instance.failure(new Error($t("請先停止伺服器後再更換 Java 版本")));
    }

    const newCommand = params?.startCommand;
    if (!newCommand) throw new Error("JavaSwitchCommand: Missing startCommand");

    try {
      instance.setLock(true);
      instance.status(Instance.STATUS_BUSY);
      instance.println("System", `正在切換啟動指令為: ${newCommand}`);

      // 1. 修改內存中的配置
      instance.config.startCommand = newCommand;
      
      // 2. 嘗試調用配置對象的保存方法
      // 在多數 MCSManager 版本中，配置持久化是通過 instance.config.save()
      if (typeof (instance.config as any).save === 'function') {
          await (instance.config as any).save();
      } else {
          // 如果沒有 save，嘗試保存更新
          await (instance.config as any).saveUpdate();
      }

      instance.println("System", "Java 環境切換成功！");
    } catch (err: any) {
      instance.println("System", `切換失敗: ${err.message}`);
    } finally {
      instance.asynchronousTask = undefined;
      instance.setLock(false);
      instance.status(Instance.STATUS_STOP);
    }
  }

  async stop(instance: Instance): Promise<void> {}
}
