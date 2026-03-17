import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";
import Instance from "../../entity/instance/instance";
import { $t } from "../../i18n";
import { AsyncTask } from "./index";

interface ICurseForgeConfig {
  projectId: string;
  versionId: string;
  apiKey: string;
}

export class CurseForgeInstallTask extends AsyncTask {
  public static readonly TYPE = "CurseForgeInstallTask";
  private process: any = null;

  constructor(
    public readonly instance: Instance,
    public readonly config: ICurseForgeConfig
  ) {
    super();
    this.type = CurseForgeInstallTask.TYPE;
    this.taskId = `${this.type}-${instance.instanceUuid}-${Date.now()}`;
  }

  async onStart(): Promise<void> {
    // 1. 【關鍵修正】立即切換實例狀態為「維護/處理中」 (STATUS_BUSY)
    // 這樣前端的實例列表會立刻顯示為「維護中」，且按鈕會變成不可用
    this.instance.status(Instance.STATUS_BUSY);

    const scriptPath = path.join(process.cwd(), "scripts", "curseforge_install.sh");

    if (!fs.existsSync(scriptPath)) {
      const errMessage = `[ERROR] 找不到安裝安裝程式，請聯絡客戶服務: ${scriptPath}`;
      this.instance.print(`${errMessage}\n`);
      this.instance.status(Instance.STATUS_STOP); // 出錯恢復狀態
      throw new Error(errMessage);
    }

    this.instance.print("--------------------------------------------------\n");
    this.instance.print($t("正在進行 CurseForge Modpack 安裝...\n"));
    this.instance.print(`Project ID: ${this.config.projectId}\n`);
    this.instance.print("--------------------------------------------------\n");

    this.process = spawn("bash", [scriptPath], {
      detached: true, // 核心修改：開啟脫離模式，創建新進程組
      env: {
        ...process.env,
        SERVER_DIR: this.instance.config.cwd,
        PROJECT_ID: String(this.config.projectId),
        VERSION_ID: String(this.config.versionId || "latest"),
        API_KEY: this.config.apiKey,
        PATH: process.env.PATH
      }
    });
    // 讓父進程不要等待這個子進程（可選，但在 detached 模式下建議加上）
    this.process.unref();

    this.process.stdout.on("data", (data: any) => this.instance.print(data.toString()));
    this.process.stderr.on("data", (data: any) => this.instance.print(data.toString()));

// CurseForgeInstallTask.ts

this.process.on("close", (code: number) => {
  if (code === 0) {
    this.instance.print("\n[SUCCESS] 安裝順利完成！請手動選擇合適的 Java 版本。\n");
    this.stop(); // 正常結束，會觸發 onStop 並清空引用
  } else {
    // 關鍵：即使代碼不是 0，也要調用 error 或 stop
    const error = new Error(`安裝異常退出，代碼: ${code}`);
    this.instance.print(`\n[ERROR] ${error.message}\n`);
    
    // 這裡建議直接調用 stop() 以確保觸發實例狀態恢復和引用清除
    this.stop(); 
  }
});

// 增加對 spawn 本身啟動失敗的監聽
this.process.on("error", (err: Error) => {
  this.instance.print(`\n[SYSTEM ERROR] 無法啟動安裝: ${err.message}\n`);
  this.stop();
});
  }

  async onStop(): Promise<void> {
    if (this.process) {
      try { this.process.kill(); } catch (err) {}
      this.process = null;
    }
    
    // 2. 【關鍵修正】任務結束或停止，將實例狀態恢復為「停止」
    this.instance.status(Instance.STATUS_STOP);

    if (this.instance.asynchronousTask === this) {
      this.instance.asynchronousTask = null;
    }
  }

  async onError(err: Error): Promise<void> {
    this.instance.print(`\n[SYSTEM ERROR] 任務發生故障: ${err.message}\n`);
    // 發生錯誤也要確保狀態恢復
    this.instance.status(Instance.STATUS_STOP);
  }

  toObject() {
    return {
      taskId: this.taskId,
      type: this.type,
      status: this.status(),
      projectId: this.config.projectId,
      instanceUuid: this.instance.instanceUuid
    };
  }
}

/**
 * 工廠函數：增加了安全檢查
 */
export function createCurseForgeTask(instance: Instance, config: ICurseForgeConfig) {
  // 3. 【關鍵修正】防止重複啟動任務
  // 如果實例當前不是停止狀態，或者已經有異步任務在跑，直接攔截
  if (instance.status() !== Instance.STATUS_STOP) {
    throw new Error("清先關閉伺服器再使用該功能！");
  }
  if (instance.asynchronousTask) {
    throw new Error("該實例當前已有其他異步任務正在運行！");
  }

  const task = new CurseForgeInstallTask(instance, config);
  instance.asynchronousTask = task;
  task.start();
  return task;
}
