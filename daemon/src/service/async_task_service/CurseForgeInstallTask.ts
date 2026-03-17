import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";
import Instance from "../../entity/instance/instance";
import { $t } from "../../i18n";
import { IExecutable } from "../interfaces"; // 確保從正確的路徑導入介面

interface ICurseForgeConfig {
  projectId: string;
  versionId: string;
  apiKey: string;
}

// 實作 IExecutable 介面，解決 Property 'exec' is missing 的錯誤
export class CurseForgeInstallTask implements IExecutable<any> {
  public static readonly TYPE = "CurseForgeInstallTask";
  
  public taskId: string;
  private process: any = null;

  constructor(
    public readonly instance: Instance,
    public readonly config: ICurseForgeConfig
  ) {
    // 生成唯一 Task ID
    this.taskId = `${CurseForgeInstallTask.TYPE}-${instance.instanceUuid}-${Date.now()}`;
  }

  /**
   * 實作 IExecutable 要求的 exec 方法
   * 這是任務的啟動入口
   */
  async exec(): Promise<any> {
    const scriptPath = path.join(process.cwd(), "scripts", "curseforge_install.sh");

    if (!fs.existsSync(scriptPath)) {
      this.instance.print(`[ERROR] 找不到安裝腳本: ${scriptPath}\n`);
      return this.stop();
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

    this.process.on("close", (code: number) => {
      if (code === 0) {
        this.instance.print("\n[SUCCESS] CurseForge 部署成功！\n");
      } else {
        this.instance.print(`\n[ERROR] 腳本失敗，退出代碼: ${code}\n`);
      }
      this.stop();
    });

    return this;
  }

  /**
   * 實作 IExecutable 要求的 stop 方法
   */
  async stop(): Promise<any> {
    if (this.process) {
      try {
        this.process.kill();
      } catch (err) {}
      this.process = null;
    }
    // 釋放實例上的異步任務佔位
    if (this.instance.asynchronousTask === this) {
      this.instance.asynchronousTask = null;
    }
  }

  /**
   * 返回當前狀態 (1 為運行中, 0 為停止)
   */
  status(): number {
    return this.process ? 1 : 0;
  }

  /**
   * 返回給前端的狀態資訊
   */
  toObject() {
    return {
      taskId: this.taskId,
      type: CurseForgeInstallTask.TYPE,
      projectId: this.config.projectId,
      status: this.status()
    };
  }
}

/**
 * 工廠函數，用於在 Router 中調用
 */
export function createCurseForgeTask(instance: Instance, config: ICurseForgeConfig) {
  const task = new CurseForgeInstallTask(instance, config);
  instance.asynchronousTask = task;
  // 直接執行啟動
  task.exec();
  return task;
}
