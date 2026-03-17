import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";
import Instance from "../../entity/instance/instance";
import { $t } from "../../i18n";
import { AsyncTask } from "./index"; // 確保導入當前目錄下的 AsyncTask

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
    // 按照基類注釋：taskId 必須夠複雜
    this.taskId = `${this.type}-${instance.instanceUuid}-${Date.now()}`;
  }

  /**
   * 實現基類的抽象方法：任務啟動邏輯
   */
  async onStart(): Promise<void> {
    const scriptPath = path.join(process.cwd(), "scripts", "curseforge_install.sh");

    if (!fs.existsSync(scriptPath)) {
      const errMessage = `[ERROR] 找不到安裝腳本: ${scriptPath}`;
      this.instance.print(`${errMessage}\n`);
      throw new Error(errMessage);
    }

    this.instance.print("--------------------------------------------------\n");
    this.instance.print($t("正在啟動 CurseForge 自動化部署腳本...\n"));
    this.instance.print(`Project ID: ${this.config.projectId}\n`);
    this.instance.print("--------------------------------------------------\n");

    this.process = spawn("bash", [scriptPath], {
      env: {
        ...process.env,
        SERVER_DIR: this.instance.config.cwd,
        PROJECT_ID: this.config.projectId,
        VERSION_ID: this.config.versionId,
        API_KEY: this.config.apiKey,
        PATH: process.env.PATH
      }
    });

    this.process.stdout.on("data", (data: any) => this.instance.print(data.toString()));
    this.process.stderr.on("data", (data: any) => this.instance.print(data.toString()));

    // 監聽結束
    this.process.on("close", (code: number) => {
      if (code === 0) {
        this.instance.print("\n[SUCCESS] CurseForge 部署任務順利完成！\n");
        this.stop(); // 觸發基類的停止邏輯
      } else {
        const error = new Error(`腳本異常退出，代碼: ${code}`);
        this.instance.print(`\n[ERROR] ${error.message}\n`);
        this.error(error); // 觸發基類的錯誤處理邏輯
      }
    });
  }

  /**
   * 實現基類的抽象方法：任務停止邏輯
   */
  async onStop(): Promise<void> {
    if (this.process) {
      try {
        this.process.kill();
      } catch (err) {}
      this.process = null;
    }
    // 清理實例引用
    if (this.instance.asynchronousTask === this) {
      this.instance.asynchronousTask = null;
    }
  }

  /**
   * 實現基類的抽象方法：錯誤處理邏輯
   */
  async onError(err: Error): Promise<void> {
    this.instance.print(`\n[SYSTEM ERROR] 任務發生故障: ${err.message}\n`);
  }

  /**
   * 實現基類的抽象方法：轉換為 JSON 物件
   */
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
 * 工廠函數：用於在 Router 中調用
 */
export function createCurseForgeTask(instance: Instance, config: ICurseForgeConfig) {
  const task = new CurseForgeInstallTask(instance, config);
  // 將任務掛載到實例上
  instance.asynchronousTask = task;
  // 調用基類的 start，它會自動觸發 onStart
  task.start();
  return task;
}
