import { $t } from "../../../i18n";
import Instance from "../../instance/instance";
import InstanceCommand from "../base/command";
import GeneralKillCommand from "./general_kill"; // 修改导入路径，去掉大写，匹配实际文件名

export default class GeneralStopCommand extends InstanceCommand {
  constructor() {
    super("StopCommand");
  }

  async exec(instance: Instance) {
    const stopCommand = instance.config.stopCommand;
    if (instance.status() === Instance.STATUS_STOP || !instance.process)
      return instance.failure(new Error($t("TXT_CODE_general_stop.notRunning")));

    instance.status(Instance.STATUS_STOPPING);
    instance.ignoreEventTaskOnce();

    const stopCommandList = stopCommand.split("\n");
    for (const stopCommand of stopCommandList) {
      await instance.execPreset("command", stopCommand);
    }

    instance.print("\n");
    instance.println("INFO", $t("TXT_CODE_pty_stop.execCmd", { stopCommand: `\n${stopCommand}` }));

    const cacheStartCount = instance.startCount;

    // 10 分钟超时后，若仍未停止，则强制结束进程
    setTimeout(() => {
      if (
        instance.status() === Instance.STATUS_STOPPING &&
        instance.startCount === cacheStartCount
      ) {
        const killCmd = new GeneralKillCommand();
        killCmd.exec(instance).catch((err: any) => {  // 给 err 添加类型
          instance.println("ERROR", `強制關閉伺服器失敗: ${err}`);
        });
      }
    }, 1000 * 60 * 2);

    return instance;
  }
}
