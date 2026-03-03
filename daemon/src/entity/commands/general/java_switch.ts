import Instance from "../../instance/instance";
import InstanceCommand from "../base/command";

export default class JavaSwitchCommand extends InstanceCommand {
  constructor() { super("JavaSwitchCommand"); }

  async exec(instance: Instance, params?: any) {
    // 檢查狀態：必須停止
    if (instance.status() !== Instance.STATUS_STOP) {
      throw new Error("請先停止伺服器後再切換 Java 版本");
    }

    const newCmd = params?.startCommand;
    if (!newCmd) throw new Error("缺少啟動指令參數");

    // 直接在 Daemon 內核修改配置 (繞過 Panel 權限檢查)
    instance.config.startCommand = newCmd;
    
    // 強制保存到檔案
    // @ts-ignore
    await instance.parameters({ startCommand: newCmd }, true);
    
    instance.println("SYSTEM", `Java 版本已切換為啟動腳本: ${newCmd}`);
  }
}
