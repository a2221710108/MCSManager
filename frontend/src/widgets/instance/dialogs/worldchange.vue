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
import { 
  CloudUploadOutlined, 
  InteractionOutlined,
  LoadingOutlined 
} from "@ant-design/icons-vue";
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

const normalizePath = (path: string) => {
  return path.replace(/\/+$/, "") + "/";
};

/**
 * 精準掃描器：利用 type 標記區分目錄與檔案
 * 只有 type 為 0 (目錄) 時才進行遞歸
 */
const deepScanWorlds = async (targetPath: string, results: DetectedWorld[] = [], depth = 0) => {
  const currentPath = normalizePath(targetPath);
  
  // 地圖結構通常不會太深，5層是合理的防護界限
  if (depth > 5) return results; 

  try {
    const res = await fetchFiles({
      params: { 
        daemonId: props.daemonId, uuid: props.instanceId, 
        target: currentPath, page: 0, page_size: 150, file_name: "" 
      }
    });
    
    const items = res.value?.items || [];

    // 1. 檢查當前目錄下是否存在 level.dat (必須是檔案，type === 1)
    const hasLevelDat = items.some(i => i.name.toLowerCase() === "level.dat" && i.type === 1);

    if (hasLevelDat) {
      const lowerPath = currentPath.toLowerCase();
      // 識別維度 (地獄/末地)
      const isNether = lowerPath.includes("nether") || lowerPath.includes("dim-1");
      const isEnd = (lowerPath.includes("the_end") || lowerPath.includes("dim1") || lowerPath.includes("end")) && !lowerPath.includes("friend");
      
      results.push({ path: currentPath, isNether, isEnd });
      // 找到 level.dat 後通常不需要再深入該目錄的子資料夾
      return results;
    }

    // 2. 篩選出真正的子目錄 (type === 0) 並排除無關路徑
    const subDirs = items.filter(item => {
      const name = item.name.toLowerCase();
      const isSystemDir = ["logs", "plugins", "cache", "bin", "libraries", "versions", "config", "metadata"].includes(name);
      return item.type === 0 && !isSystemDir;
    });

    // 3. 併發遞歸掃描，提升效能
    await Promise.all(subDirs.map(dir => 
      deepScanWorlds(`${currentPath}${dir.name}/`, results, depth + 1)
    ));

  } catch (e) {
    console.warn(`[Scan] 無法讀取路徑: ${currentPath}`, e);
  }
  return results;
};

const handleMapReplace = async (file: File) => {
  const msgKey = "map_replace_task";
  const info = await fetchInstanceInfo({ params: { daemonId: props.daemonId, uuid: props.instanceId } });
  
  if (info.value?.status !== 0) {
    return Modal.warning({ title: t("伺服器運行中"), content: t("請先關閉伺服器後再進行地圖替換。") });
  }

  Modal.confirm({
    title: t("地圖智慧替換"),
    content: t("系統將精準解析壓縮包結構並自動對齊維度。這將覆蓋現有的 world 資料夾，確定繼續嗎？"),
    onOk: async () => {
      try {
        uploading.value = true;
        const tempDirName = `tmp_map_${Date.now()}`;
        
        // 1. 上傳壓縮包
        message.loading({ content: t("正在上傳存檔..."), key: msgKey });
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
        message.loading({ content: t("正在解壓並分析結構..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { type: 2, code: "utf-8", source: "/" + file.name, targets: `/${tempDirName}/` }
        });

        // 3. 掃描分析
        const allDetected = await deepScanWorlds(`/${tempDirName}/`);
        
        // 提取主世界 (取路徑最短的那個)
        const mainWorld = allDetected
          .filter(w => !w.isNether && !w.isEnd)
          .sort((a, b) => a.path.length - b.path.length)[0];

        if (!mainWorld) throw new Error(t("壓縮包內找不到有效的 level.dat 存檔。"));

        // 4. 重組搬運
        message.loading({ content: t("正在對齊存檔結構..."), key: msgKey });
        
        // 準備搬運清單
        const moveTasks: [string, string][] = [[mainWorld.path, "/world/"]];

        const nether = allDetected.find(w => w.isNether);
        if (nether) moveTasks.push([nether.path, "/world/DIM-1/"]);

        const end = allDetected.find(w => w.isEnd);
        if (end) moveTasks.push([end.path, "/world/DIM1/"]);

        // 清理舊資料夾
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/world", "/world_nether", "/world_the_end"] }
        });

        // 執行搬運
        await executeMove({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: moveTasks }
        });

        // 5. 清理臨時檔案
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/" + file.name, "/" + tempDirName] }
        });

        message.success({ content: t("地圖替換完成！"), key: msgKey });
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
        <a-upload-dragger 
          :show-upload-list="false" 
          :before-upload="(file: any) => { handleMapReplace(file); return false; }"
        >
          <p class="ant-upload-drag-icon"><CloudUploadOutlined style="color: #1890ff" /></p>
          <p class="ant-upload-text">點擊或拖拽地圖壓縮包至此</p>
          <p class="ant-upload-hint">支持自動分析子目錄，利用文件類型標記實現快速結構對齊</p>
        </a-upload-dragger>
      </div>
      <div v-else class="py-10 text-center">
        <LoadingOutlined spin style="font-size: 24px; color: #1890ff" />
        <div class="mt-4 text-base font-medium">
          {{ uploadData.current ? t('正在傳輸存檔文件...') : t('正在處理地圖結構...') }}
        </div>
        <div v-if="uploadData.current" class="mt-4 px-10">
          <a-progress :percent="progress" status="active" size="small" />
        </div>
      </div>
    </div>
  </a-modal>
</template>
