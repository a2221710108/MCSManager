import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";
import Instance from "../../entity/instance/instance";
import { $t } from "../../i18n";
import { AsyncTask } from "./index";

interface IModLoaderConfig {
  mcVersion: string;
  loaderType: string;
  loaderVersion: string;
}

export class ModLoaderInstallTask extends AsyncTask {
  public static readonly TYPE = "ModLoaderInstallTask";
  private process: any = null;

  constructor(
    public readonly instance: Instance,
    public readonly config: IModLoaderConfig
  ) {
    super();
    this.type = ModLoaderInstallTask.TYPE;
    this.taskId = `${this.type}-${instance.instanceUuid}-${Date.now()}`;
  }

  async onStart(): Promise<void> {
    // 切換實例狀態為「忙碌」，防止用戶誤觸開服
    this.instance.status(Instance.STATUS_BUSY);

    const scriptPath = path.join(process.cwd(), "scripts", "modloader_install.sh");

    if (!fs.existsSync(scriptPath)) {
      const err = `[ERROR] 找不到腳本: ${scriptPath}`;
      this.instance.print(`${err}\n`);
      this.stop();
      throw new Error(err);
    }

    this.instance.print("--------------------------------------------------\n");
    this.instance.print(`[LazyCloud] 開始安裝 ModLoader: ${this.config.loaderType}\n`);
    this.instance.print(`版本: ${this.config.mcVersion} - ${this.config.loaderVersion}\n`);
    this.instance.print("--------------------------------------------------\n");

    this.process = spawn("bash", [
  scriptPath,
  this.config.mcVersion,      // 傳遞給腳本的 $1
  this.config.loaderType,     // 傳遞給腳本的 $2
  this.config.loaderVersion   // 傳遞給腳本的 $3
], {
      detached: true,
      env: {
        ...process.env,
        SERVER_DIR: this.instance.config.cwd,
        // 關鍵：將 Key 改為腳本頂部定義的名字
        mcVersion: this.config.mcVersion,
        loaderType: this.config.loaderType,
        loaderVersion: this.config.loaderVersion
      }
    });

    this.process.stdout.on("data", (data: any) => this.instance.print(data.toString()));
    this.process.stderr.on("data", (data: any) => this.instance.print(data.toString()));

    this.process.on("close", (code: number) => {
      if (code === 0) {
        this.instance.print("\n[SUCCESS] ModLoader 安裝完成！\n");
      } else {
        this.instance.print(`\n[ERROR] 安裝異常退出，代碼: ${code}\n`);
      }
      this.stop();
    });
  }

  async onStop(): Promise<void> {
    if (this.process) {
      try { this.process.kill(); } catch (err) {}
      this.process = null;
    }
    this.instance.status(Instance.STATUS_STOP);
    if (this.instance.asynchronousTask === this) this.instance.asynchronousTask = null;
  }

  async onError(err: Error): Promise<void> {
    this.instance.print(`\n[SYSTEM ERROR] 任務發生故障: ${err.message}\n`);
    this.instance.status(Instance.STATUS_STOP);
}

  toObject() {
    return {
      taskId: this.taskId,
      type: this.type,
      mcVersion: this.config.mcVersion,
      loaderType: this.config.loaderType
    };
  }
}

export function createModLoaderTask(instance: Instance, config: IModLoaderConfig) {
  if (instance.status() !== Instance.STATUS_STOP) throw new Error("請先關閉伺服器");
  if (instance.asynchronousTask) throw new Error("已有任務正在運行");

  const task = new ModLoaderInstallTask(instance, config);
  instance.asynchronousTask = task;
  task.start();
  return task;
}
