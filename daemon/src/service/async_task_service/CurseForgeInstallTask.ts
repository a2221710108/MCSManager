import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";
import Instance from "../../entity/instance/instance";
import { $t } from "../../i18n";
import logger from "../../service/log";
import { Task } from "./task";

interface ICurseForgeConfig {
  projectId: string;
  versionId: string;
  apiKey: string;
}

export class CurseForgeInstallTask extends Task {
  public static readonly TYPE = "CurseForgeInstallTask";
  private process: any = null;

  constructor(
    public readonly instance: Instance,
    public readonly config: ICurseForgeConfig
  ) {
    super();
  }

  /**
   * 任務執行入口
   */
  async run() {
    // 1. 定義腳本絕對路徑 (假設放在 daemon/scripts 下)
    const scriptPath = path.join(process.cwd(), "scripts", "curseforge_install.sh");

    // 檢查腳本是否存在
    if (!fs.existsSync(scriptPath)) {
      this.instance.print(`[ERROR] 找不到安裝腳本: ${scriptPath}\n`);
      return this.stop();
    }

    this.instance.print("--------------------------------------------------\n");
    this.instance.print($t("正在啟動 CurseForge 自動化部署腳本...\n"));
    this.instance.print(`專案 ID: ${this.config.projectId}\n`);
    this.instance.print(`文件 ID: ${this.config.versionId}\n`);
    this.instance.print("--------------------------------------------------\n");

    try {
      // 2. 調用 Spawn 執行 Bash
      // 注意：將 SERVER_DIR 指向實例的當前工作目錄
      this.process = spawn("bash", [scriptPath], {
        env: {
          ...process.env,
          SERVER_DIR: this.instance.config.cwd,
          PROJECT_ID: this.config.projectId,
          VERSION_ID: this.config.versionId,
          API_KEY: this.config.apiKey,
          // 確保路徑中包含 java 等必要命令
          PATH: process.env.PATH
        }
      });

      // 3. 實時將腳本輸出推送到實例控制台
      this.process.stdout.on("data", (data: any) => {
        this.instance.print(data.toString());
      });

      this.process.stderr.on("data", (data: any) => {
        // 部分 wget 輸出可能在 stderr，這裡統一顯示
        this.instance.print(data.toString());
      });

      // 4. 監聽結束事件
      this.process.on("close", (code: number) => {
        if (code === 0) {
          this.instance.print("\n[SUCCESS] CurseForge 部署任務順利完成！\n");
          this.instance.print("提示：請確認控制台顯示的核心檔案（如 forge.jar）是否存在後再啟動。\n");
        } else {
          this.instance.print(`\n[ERROR] 腳本執行異常退出，錯誤代碼: ${code}\n`);
        }
        this.stop();
      });

      this.process.on("error", (err: Error) => {
        this.instance.print(`\n[ERROR] 無法啟動安裝進程: ${err.message}\n`);
        this.stop();
      });

    } catch (err: any) {
      this.instance.print(`\n[ERROR] 任務發生未預期錯誤: ${err.message}\n`);
      this.stop();
    }
  }

  /**
   * 終止任務 (當用戶在網頁點擊「停止任務」時調用)
   */
  async stop() {
    if (this.process) {
      try {
        this.process.kill();
      } catch (err) {}
      this.process = null;
    }
    this.instance.asynchronousTask = null;
    this.instance.print("\n[SYSTEM] CurseForge 安裝任務已結束。\n");
  }

  /**
   * 返回給前端的狀態資訊
   */
  toObject() {
    return {
      type: CurseForgeInstallTask.TYPE,
      projectId: this.config.projectId,
      status: this.status()
    };
  }
}

/**
 * 工廠函數，用於在 Router 中創建任務
 */
export function createCurseForgeTask(instance: Instance, config: ICurseForgeConfig) {
  const task = new CurseForgeInstallTask(instance, config);
  task.run();
  return task;
}
