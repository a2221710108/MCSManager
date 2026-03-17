import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { v4 } from "uuid";
import Instance from "../../entity/instance/instance";
import InstanceConfig from "../../entity/instance/Instance_config";
import { getFileManager } from "../file_router_service";
import logger from "../log";
import { AsyncTask, TaskCenter } from "./index";
import { pipeline, Readable } from "stream";

export interface CurseForgeOptions {
  projectId: string;
  versionId?: string; // 預設為 latest
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

  /**
   * 封裝 CurseForge API 請求
   */
  private async cfApi(endpoint: string) {
    const url = `https://api.curseforge.com/v1${endpoint}`;
    return await axios.get(url, {
      headers: { "x-api-key": this.options.apiKey, Accept: "application/json" },
      signal: this.abortController?.signal
    });
  }

  /**
   * 通用下載工具（帶進度打印）
   */
  private async download(url: string, destName: string, label: string) {
    const cwd = this.instance.absoluteCwdPath();
    const savePath = path.normalize(path.join(cwd, destName));
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

      // 1. 獲取專案資訊與下載路徑
      const { projectId, versionId } = this.options;
      const projectRes = await this.cfApi(`/mods/${projectId}`);
      const projectTitle = projectRes.data.data.name;
      
      let targetFileId = versionId;
      if (!targetFileId || targetFileId === "latest") {
        targetFileId = projectRes.data.data.mainFileId;
      }

      this.instance.println("INFO", `專案名稱: ${projectTitle} (ID: ${projectId})`);
      this.instance.println("INFO", `檔案 ID: ${targetFileId}`);

      // 2. 獲取下載 URL 並下載主壓縮包
      const fileRes = await this.cfApi(`/mods/${projectId}/files/${targetFileId}/download-url`);
      const downloadUrl = fileRes.data.data;
      await this.download(downloadUrl, this.TMP_ZIP_NAME, "整合包主檔案");

      // 3. 解壓縮
      this.instance.println("INFO", "正在解壓整合包...");
      const isOk = await fileManager.unzip(this.TMP_ZIP_NAME, ".", "UTF-8");
      if (!isOk) throw new Error("解壓失敗，請檢查壓縮包格式或磁碟空間。");

      // 4. 解析 manifest.json (Bash 的 get_loader 部分)
      const manifestPath = path.join(cwd, "manifest.json");
      if (!fs.existsSync(manifestPath)) throw new Error("找不到 manifest.json，這可能不是標準的 CurseForge 整合包。");
      
      const manifest = await fs.readJson(manifestPath);
      const mcVersion = manifest.minecraft.version;
      const loader = manifest.minecraft.modLoaders.find((l: any) => l.primary) || manifest.minecraft.modLoaders[0];
      
      this.instance.println("INFO", `遊戲版本: ${mcVersion} | 加載器: ${loader.id}`);

      // 5. 下載所有依賴 Mods (Bash 的 json_download_mods 部分)
      const modsDir = path.join(cwd, "mods");
      if (!fs.existsSync(modsDir)) await fs.mkdir(modsDir);

      this.instance.println("INFO", `準備下載 ${manifest.files.length} 個 Mods...`);
      for (const [index, modFile] of manifest.files.entries()) {
        try {
          const modDownloadRes = await this.cfApi(`/mods/${modFile.projectID}/files/${modFile.fileID}/download-url`);
          const modUrl = modDownloadRes.data.data;
          const fileName = path.basename(new URL(modUrl).pathname);
          
          await this.download(modUrl, path.join("mods", fileName), `[${index + 1}/${manifest.files.length}] ${fileName}`);
        } catch (modErr) {
          this.instance.println("ERROR", `Mod (Project: ${modFile.projectID}) 下載失敗，跳過...`);
        }
      }

      // 6. 處理 Overrides (Bash 的 json_download_overrides 部分)
      const overridesDir = path.join(cwd, "overrides");
      if (fs.existsSync(overridesDir)) {
        this.instance.println("INFO", "正在複製 Overrides 覆蓋檔案...");
        await fs.copy(overridesDir, cwd);
        await fs.remove(overridesDir);
      }

      // 7. 清理臨時壓縮包
      const fullZipPath = fileManager.toAbsolutePath(this.TMP_ZIP_NAME);
      if (fs.existsSync(fullZipPath)) await fs.remove(fullZipPath);

      this.instance.println("INFO", "================================================");
      this.instance.println("INFO", "★ CurseForge 整合包安裝完成！");
      this.instance.println("INFO", "請手動下載並運行對應的加載器安裝程序 (Forge/Fabric)。");
      this.instance.println("INFO", "================================================");

      this.stop();
    } catch (err: any) {
      this.instance.println("ERROR", `安裝過程中發生錯誤: ${err.message}`);
      logger.error(`CurseForgeInstallTask Error: ${err.stack}`);
      this.error(err);
    } finally {
      this.instance.status(Instance.STATUS_STOP);
    }
  }

  async onStop() {
    this.abortController?.abort();
    this.instance.println("WARN", "使用者取消了 CurseForge 安裝任務。");
  }

  toObject() {
    return {
      taskId: this.taskId,
      instanceUuid: this.instance.instanceUuid,
      type: this.type
    };
  }
}

/**
 * 創建並啟動任務
 */
export function createCurseForgeTask(instance: Instance, options: CurseForgeOptions) {
  const task = new CurseForgeInstallTask(instance, options);
  TaskCenter.addTask(task);
  return task;
}
