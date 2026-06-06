import { $t } from "../../../i18n";
import Instance from "../../instance/instance";
import InstanceCommand from "../base/command";
import GeneralKillCommand from "./GeneralKillCommand";

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
        instance.println("WARN", $t("TXT_CODE_general_stop.stopTimeout"));
        const killCmd = new GeneralKillCommand();
        killCmd.exec(instance).catch((err) => {
          instance.println("ERROR", `强制关闭实例失败: ${err}`);
        });
      }
    }, 1000 * 60 * 1);

    return instance;
  }
}
