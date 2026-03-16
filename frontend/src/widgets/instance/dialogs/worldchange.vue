<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { 
  fileList as getFileListApi, 
  deleteFile as deleteFileApi, 
  compressFile as compressFileApi,
  uploadAddress,
  moveFile as moveFileApi 
} from "@/services/apis/fileManager";
import { getInstanceInfo } from "@/services/apis/instance";
import { CloudUploadOutlined, LoadingOutlined } from "@ant-design/icons-vue";
import uploadService from "@/services/uploadService";
import { parseForwardAddress } from "@/tools/protocol";

const open = ref(false);
const uploading = ref(false);
const props = defineProps<{ daemonId: string; instanceId: string; }>();

const { execute: fetchFiles } = getFileListApi();
const { execute: executeDelete } = deleteFileApi();
const { execute: executeCompress } = compressFileApi();
const { execute: fetchInstanceInfo } = getInstanceInfo();
const { execute: getUploadMissionCfg } = uploadAddress();
const { execute: executeMove } = moveFileApi();

const uploadData = uploadService.uiData;
const progress = computed(() => {
  if (uploadData.value.current) {
    return Math.floor((uploadData.value.current[0] * 100) / uploadData.value.current[1]);
  }
  return 0;
});

interface DetectedWorld {
  path: string;
  isNether: boolean;
  isEnd: boolean;
}

const openDialog = () => { open.value = true; };
const normalizePath = (path: string) => path.replace(/\/+$/, "") + "/";

/**
 * 核心掃描器：基於內容特徵識別維度
 */
const deepScanWorlds = async (targetPath: string, results: DetectedWorld[] = [], depth = 0) => {
  const currentPath = normalizePath(targetPath);
  if (depth > 5) return results;

  try {
    const res = await fetchFiles({
      params: { daemonId: props.daemonId, uuid: props.instanceId, target: currentPath, page: 0, page_size: 150, file_name: "" }
    });
    const items = res.value?.items || [];

    // 1. 特徵檢測
    const hasLevelDat = items.some(i => i.name.toLowerCase() === "level.dat" && i.type === 1);
    const hasDimMinus1 = items.some(i => i.name.toUpperCase() === "DIM-1" && i.type === 0);
    const hasDimPlus1 = items.some(i => i.name.toUpperCase() === "DIM1" && i.type === 0);
    const pathLower = currentPath.toLowerCase();

    if (hasLevelDat) {
      // 判定邏輯：不管資料夾叫什麼，裡面有 DIM-1 或路徑含 nether 就是地獄
      const isNether = hasDimMinus1 || pathLower.includes("nether") || pathLower.includes("dim-1");
      const isEnd = hasDimPlus1 || ((pathLower.includes("end") || pathLower.includes("dim1")) && !pathLower.includes("friend"));
      
      results.push({ 
        path: currentPath, 
        isNether: !!isNether, 
        isEnd: !!isEnd && !isNether // 防止雙重判定
      });
    }

    // 2. 獲取子目錄並遞歸（循序掃描避免 500 錯誤）
    const subDirs = items.filter(i => i.type === 0 && !["logs", "plugins", "cache", "bin", "libraries", "versions", "config"].includes(i.name.toLowerCase()));
    for (const dir of subDirs) {
      await deepScanWorlds(`${currentPath}${dir.name}/`, results, depth + 1);
    }
  } catch (e) {
    console.warn(`[Scan] Skip: ${currentPath}`);
  }
  return results;
};

/**
 * 路徑穿透器：解決套娃問題
 * 如果 detectedPath 裡面還有一個 DIM 資料夾，則返回子資料夾路徑
 */
const resolveFinalPath = async (detectedPath: string, dimFolderName: string) => {
  try {
    const res = await fetchFiles({
      params: { daemonId: props.daemonId, uuid: props.instanceId, target: detectedPath, page: 0, page_size: 50, file_name: "" }
    });
    const items = res.value?.items || [];
    const subDim = items.find(i => i.name.toUpperCase() === dimFolderName && i.type === 0);
    return subDim ? normalizePath(`${detectedPath}${subDim.name}`) : detectedPath;
  } catch {
    return detectedPath;
  }
};

const handleMapReplace = async (file: File) => {
  const msgKey = "map_replace_task";
  const info = await fetchInstanceInfo({ params: { daemonId: props.daemonId, uuid: props.instanceId } });
  
  if (info.value?.status !== 0) return Modal.warning({ title: t("伺服器運行中"), content: t("請先關閉伺服器。") });

  Modal.confirm({
    title: t("地圖智慧替換"),
    content: t("系統將自動識別並對齊存檔結構（支持亂序命名與插件服結構）。確定繼續嗎？"),
    onOk: async () => {
      try {
        uploading.value = true;
        const tempDirName = `tmp_map_${Date.now()}`;
        
        // 1. 上傳
        message.loading({ content: t("正在上傳..."), key: msgKey });
        const mission = await getUploadMissionCfg({
          params: { upload_dir: "/", daemonId: props.daemonId, uuid: props.instanceId, file_name: file.name }
        });
        const config = mission.value;
        if (!config?.addr) throw new Error("授權失敗");

        await new Promise<void>((resolve) => {
          uploadService.append(file, parseForwardAddress(config.addr, "http"), config.password, { overwrite: true }, (task) => {
            task.instanceInfo = { instanceId: props.instanceId, daemonId: props.daemonId };
          });
          const unwatch = watch(() => uploadService.uiData.value.current, (curr) => { if (!curr) { unwatch(); resolve(); } });
        });

        // 2. 解壓
        message.loading({ content: t("正在解壓分析..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { type: 2, code: "utf-8", source: "/" + file.name, targets: `/${tempDirName}/` }
        });

        // 3. 執行智慧掃描
        const allDetected = await deepScanWorlds(`/${tempDirName}/`);
        
        // 篩選邏輯
        const nether = allDetected.find(w => w.isNether);
        const end = allDetected.find(w => w.isEnd);
        const mainWorld = allDetected.filter(w => !w.isNether && !w.isEnd).sort((a, b) => a.path.length - b.path.length)[0];

        if (!mainWorld) throw new Error(t("壓縮包內找不到有效的主世界存檔 (level.dat)"));

        // 4. 構建搬運任務並執行「路徑穿透」
        message.loading({ content: t("正在對齊結構..."), key: msgKey });
        const moveTasks: [string, string][] = [[mainWorld.path, "/world/"]];

        if (nether) {
          const finalNetherPath = await resolveFinalPath(nether.path, "DIM-1");
          moveTasks.push([finalNetherPath, "/world/DIM-1/"]);
        }
        if (end) {
          const finalEndPath = await resolveFinalPath(end.path, "DIM1");
          moveTasks.push([finalEndPath, "/world/DIM1/"]);
        }

        // 5. 清理舊地圖並移動新地圖
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/world"] } 
        });

        await executeMove({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: moveTasks }
        });

        // 6. 最終清理
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/" + file.name, "/" + tempDirName] }
        });

        message.success({ content: t("地圖智慧替換完成！"), key: msgKey });
        open.value = false;
      } catch (err: any) {
        message.error({ content: t("操作失敗: ") + err.message, key: msgKey });
      } finally {
        uploading.value = false;
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="open" :title="t('地圖智慧替換')" :footer="null" centered :mask-closable="!uploading" width="480px">
    <div class="p-4">
      <div v-if="!uploading">
        <a-upload-dragger :show-upload-list="false" :before-upload="(file: any) => { handleMapReplace(file); return false; }">
          <p class="ant-upload-drag-icon"><CloudUploadOutlined style="color: #1890ff" /></p>
          <p class="ant-upload-text">點擊或拖拽地圖壓縮包至此</p>
          <p class="ant-upload-hint">無視目錄命名、自動識別插件服/原版結構並對齊維度</p>
        </a-upload-dragger>
      </div>
      <div v-else class="py-10 text-center">
        <LoadingOutlined spin style="font-size: 24px; color: #1890ff" />
        <div class="mt-4 text-base font-medium">
          {{ uploadData.current ? t('數據傳輸中...') : t('分析與對齊結構中...') }}
        </div>
        <div v-if="uploadData.current" class="mt-4 px-10">
          <a-progress :percent="progress" status="active" size="small" />
        </div>
      </div>
    </div>
  </a-modal>
</template>
