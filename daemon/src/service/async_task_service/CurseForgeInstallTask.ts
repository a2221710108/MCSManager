import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";
import Instance from "../../entity/instance/instance";
import { $t } from "../../i18n";
import { Task } from "./index"; // 修改這裡：通常任務基類在 index 裡導出

interface ICurseForgeConfig {
  projectId: string;
  versionId: string;
  apiKey: string;
}

// 確保繼承 Task 類以獲得 status 等屬性
export class CurseForgeInstallTask extends Task {
  public static readonly TYPE = "CurseForgeInstallTask";
  private process: any = null;
  public taskId: string;

  constructor(
    public readonly instance: Instance,
    public readonly config: ICurseForgeConfig
  ) {
    super();
    // 生成一個唯一的任務 ID
    this.taskId = `${CurseForgeInstallTask.TYPE}-${instance.instanceUuid}-${Date.now()}`;
  }

  // MCSManager 核心會調用這個方法啟動任務
  async onExecute(): Promise<any> {
    const scriptPath = path.join(process.cwd(), "scripts", "curseforge_install.sh");

    if (!fs.existsSync(scriptPath)) {
      this.instance.print(`[ERROR] 找不到安裝腳本: ${scriptPath}\n`);
      this.stop();
      return;
    }

    this.instance.print("--------------------------------------------------\n");
    this.instance.print($t("正在啟動 CurseForge 自動化部署腳本...\n"));
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
  }

  // 實現系統要求的停止介面
  async onStop(): Promise<any> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.instance.asynchronousTask = null;
  }

  // 獲取當前狀態數字
  status(): number {
    return this.process ? 1 : 0;
  }

  toObject() {
    return {
      taskId: this.taskId,
      type: CurseForgeInstallTask.TYPE,
      projectId: this.config.projectId,
      status: this.status()
    };
  }
}

export function createCurseForgeTask(instance: Instance, config: ICurseForgeConfig) {
  const task = new CurseForgeInstallTask(instance, config);
  // 在 MCSManager 中，通常是將任務交給實例物件，由實例負責調用執行
  instance.asynchronousTask = task;
  task.onExecute(); 
  return task;
}
