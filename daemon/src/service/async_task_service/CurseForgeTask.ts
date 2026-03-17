import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { v4 } from "uuid";
import { pipeline, Readable } from "stream";
import Instance from "../../entity/instance/instance";
import { getFileManager } from "../file_router_service";
import logger from "../log";
import { AsyncTask, IAsyncTaskJSON, TaskCenter } from "./index";
import { $t } from "../../i18n";

export interface CurseForgeOptions {
  projectId: string;
  versionId?: string;
  apiKey: string;
}

export class CurseForgeInstallTask extends AsyncTask {
  public static TYPE = "CurseForgeInstallTask";
  public readonly TMP_ZIP_NAME = "curseforge_pack.zip";
  private abortController?: AbortController;

  constructor(
    public instance: Instance,
    public options: CurseForgeOptions
  ) {
    super();
    this.taskId = `${CurseForgeInstallTask.TYPE}-${this.instance.instanceUuid}-${v4()}`;
    this.type = CurseForgeInstallTask.TYPE;
  }

  private async cfApi(endpoint: string) {
    const url = `https://api.curseforge.com/v1${endpoint}`;
    return await axios.get(url, {
      headers: { "x-api-key": this.options.apiKey, Accept: "application/json" },
      signal: this.abortController?.signal
    });
  }

  private async download(url: string, destName: string, label: string) {
    const cwd = this.instance.absoluteCwdPath();
    const savePath = path.normalize(path.join(cwd, destName));
    
    // 確保父目錄存在 (針對 mods/xxx.jar)
    await fs.ensureDir(path.dirname(savePath));
    const writer = fs.createWriteStream(savePath);
    
    this.instance.println("INFO", `正在下載 ${label}...`);

    const response = await axios<Readable>({
      url,
      responseType: "stream",
      signal: this.abortController?.signal
    });

    await new Promise((resolve, reject) => {
      pipeline(response.data, writer, (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
    return savePath;
  }

  async onStart() {
    this.abortController = new AbortController();
    const fileManager = getFileManager(this.instance.instanceUuid);
    const cwd = this.instance.absoluteCwdPath();

    try {
      this.instance.status(Instance.STATUS_BUSY);
      this.instance.println("INFO", "========== 開始 CurseForge 自動安裝程序 ==========");

      const { projectId, versionId } = this.options;
      const projectRes = await this.cfApi(`/mods/${projectId}`);
      const projectTitle = projectRes.data.data.name;
      
      let targetFileId = versionId;
      if (!targetFileId || targetFileId === "latest") {
        targetFileId = projectRes.data.data.mainFileId;
      }

      this.instance.println("INFO", `專案名稱: ${projectTitle} (ID: ${projectId})`);
      
      const fileRes = await this.cfApi(`/mods/${projectId}/files/${targetFileId}/download-url`);
      const downloadUrl = fileRes.data.data;
      await this.download(downloadUrl, this.TMP_ZIP_NAME, "整合包主檔案");

      this.instance.println("INFO", "正在解壓整合包...");
      const isOk = await fileManager.unzip(this.TMP_ZIP_NAME, ".", "UTF-8");
      if (!isOk) throw new Error("解壓失敗，請檢查壓縮包格式。");

      const manifestPath = path.join(cwd, "manifest.json");
      if (!fs.existsSync(manifestPath)) throw new Error("找不到 manifest.json");
      
      const manifest = await fs.readJson(manifestPath);
      this.instance.println("INFO", `遊戲版本: ${manifest.minecraft.version}`);

      // 下載 Mods
      for (const [index, modFile] of manifest.files.entries()) {
        try {
          const modDownloadRes = await this.cfApi(`/mods/${modFile.projectID}/files/${modFile.fileID}/download-url`);
          const modUrl = modDownloadRes.data.data;
          const fileName = path.basename(new URL(modUrl).pathname);
          await this.download(modUrl, path.join("mods", fileName), `[${index + 1}/${manifest.files.length}] ${fileName}`);
        } catch (e) {
          this.instance.println("ERROR", `Mod ID ${modFile.projectID} 下載跳過`);
        }
      }

      // Overrides
      const overridesDir = path.join(cwd, "overrides");
      if (fs.existsSync(overridesDir)) {
        this.instance.println("INFO", "正在處理 Overrides...");
        await fs.copy(overridesDir, cwd);
        await fs.remove(overridesDir);
      }

      await fs.remove(fileManager.toAbsolutePath(this.TMP_ZIP_NAME));
      this.instance.println("INFO", "★ CurseForge 安裝完成！");
      this.stop();
    } catch (err: any) {
      this.error(err);
    } finally {
      this.instance.status(Instance.STATUS_STOP);
    }
  }

  async onStop() {
    this.abortController?.abort();
    this.instance.println("WARN", "任務已停止。");
  }

  /**
   * 實作抽象成員 onError
   */
  async onError(err: Error) {
    this.instance.println("ERROR", `[CurseForge Error] ${err?.message}`);
    logger.error(`CurseForge 任務失敗:`, err);
  }

  /**
   * 實作狀態序列化
   */
  toObject(): IAsyncTaskJSON {
    return JSON.parse(
      JSON.stringify({
        taskId: this.taskId,
        status: this.status(),
        instanceUuid: this.instance.instanceUuid,
        instanceStatus: this.instance.status(),
        type: this.type
      })
    );
  }
}

export function createCurseForgeTask(instance: Instance, options: CurseForgeOptions) {
  const task = new CurseForgeInstallTask(instance, options);
  TaskCenter.addTask(task);
  return task;
}
