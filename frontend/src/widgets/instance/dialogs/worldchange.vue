<script setup lang="ts">
import { ref, createVNode, computed, watch } from "vue";
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
import { useScreen } from "@/hooks/useScreen";
import { 
  CloudUploadOutlined, 
  WarningOutlined, 
  InteractionOutlined,
  LoadingOutlined 
} from "@ant-design/icons-vue";
import uploadService from "@/services/uploadService";
import { parseForwardAddress } from "@/tools/protocol";
import { convertFileSize } from "@/tools/fileSize";

const open = ref(false);
const uploading = ref(false);
const { isPhone } = useScreen();

const props = defineProps<{
  daemonId: string;
  instanceId: string;
}>();

// API 實作
const { execute: fetchFiles } = getFileListApi();
const { execute: executeDelete } = deleteFileApi();
const { execute: executeCompress } = compressFileApi();
const { execute: fetchInstanceInfo } = getInstanceInfo();
const { execute: getUploadMissionCfg } = uploadAddress();
const { execute: executeMove } = moveFileApi();

// 進度條計算
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

const openDialog = () => {
  open.value = true;
};

// 智慧掃描：找出所有包含 level.dat 的目錄並分析特徵
const deepScanWorlds = async (targetPath: string, results: DetectedWorld[] = []) => {
  try {
    const res = await fetchFiles({
      params: { 
        daemonId: props.daemonId, uuid: props.instanceId, 
        target: targetPath, page: 0, page_size: 100, file_name: "" 
      }
    });
    const items = res.value?.items || [];
    
    if (items.some(i => i.name === "level.dat")) {
      const lowerPath = targetPath.toLowerCase();
      results.push({
        path: targetPath.endsWith("/") ? targetPath : targetPath + "/",
        isNether: lowerPath.includes("nether") || lowerPath.includes("dim-1"),
        isEnd: lowerPath.includes("the_end") || lowerPath.includes("dim1") || (lowerPath.includes("end") && !lowerPath.includes("friend"))
      });
    }

    for (const item of items) {
      if (item.type === 1 && !["logs", "plugins", "cache"].includes(item.name.toLowerCase())) {
        await deepScanWorlds(`${targetPath}${item.name}/`, results);
      }
    }
  } catch (e) {
    console.error("Scan failed at " + targetPath, e);
  }
  return results;
};

const handleMapReplace = async (file: File) => {
  const msgKey = "map_replace_task";
  
  // 1. 預檢：確保伺服器已關閉
  const info = await fetchInstanceInfo({ params: { daemonId: props.daemonId, uuid: props.instanceId } });
  if (info.value?.status !== 0) {
    return Modal.warning({ title: t("伺服器運行中"), content: t("請先關閉伺服器後再進行地圖替換。") });
  }

  Modal.confirm({
    title: t("確認智慧替換地圖？"),
    icon: createVNode(WarningOutlined),
    content: t("系統將自動識別層級並對齊維度目錄，操作不可逆，請確保已有備份。"),
    onOk: async () => {
      try {
        uploading.value = true;
        const tempDirName = `tmp_map_${Date.now()}`;
        
        // --- 階段 A: 獲取授權並執行上傳 ---
        message.loading({ content: t("正在準備上傳..."), key: msgKey });
        const mission = await getUploadMissionCfg({
          params: { upload_dir: "/", daemonId: props.daemonId, uuid: props.instanceId, file_name: file.name }
        });
        const config = mission.value;
        if (!config?.addr || !config.password) throw new Error("無法獲取上傳授權");

        await new Promise<void>((resolve) => {
          uploadService.append(file, parseForwardAddress(config.addr, "http"), config.password, { overwrite: true }, (task) => {
            task.instanceInfo = { instanceId: props.instanceId, daemonId: props.daemonId };
          });
          const unwatch = watch(() => uploadService.uiData.value.current, (curr) => {
            if (!curr) { unwatch(); resolve(); }
          });
        });

        // --- 階段 B: 解壓到臨時目錄 ---
        message.loading({ content: t("正在解壓分析結構..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { type: 2, code: "utf-8", source: "/" + file.name, targets: `/${tempDirName}/` }
        });

        // --- 階段 C: 智慧維度識別 ---
        const allDetected = await deepScanWorlds(`/${tempDirName}/`);
        
        // 找到主世界 (最淺層且非地獄末地的)
        const mainWorld = allDetected
          .filter(w => !w.isNether && !w.isEnd)
          .sort((a, b) => a.path.length - b.path.length)[0];

        if (!mainWorld) throw new Error(t("壓縮包內找不到有效的主世界存檔 (level.dat)"));

        const moveTargets: [string, string][] = [[mainWorld.path, "/world/"]];
        const deleteTargets = ["/world", "/world_nether", "/world_the_end"];

        // 檢查地獄 (如果不在主世界目錄內，則獨立對齊)
        const netherWorld = allDetected.find(w => w.isNether);
        if (netherWorld && !netherWorld.path.startsWith(mainWorld.path)) {
          moveTargets.push([netherWorld.path, "/world_nether/"]);
        }

        // 檢查末地
        const endWorld = allDetected.find(w => w.isEnd);
        if (endWorld && !endWorld.path.startsWith(mainWorld.path)) {
          moveTargets.push([endWorld.path, "/world_the_end/"]);
        }

        // --- 階段 D: 刪除舊地圖並移動新地圖 ---
        message.loading({ content: t("正在套用目錄對齊..."), key: msgKey });
        
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: deleteTargets }
        });

        // 批量移動對齊
        await executeMove({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: moveTargets }
        });

        // --- 階段 E: 清理臨時檔案 ---
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/" + file.name, "/" + tempDirName] }
        });

        message.success({ content: t("地圖智慧替換成功！"), key: msgKey });
        open.value = false;
        
      } catch (err: any) {
        console.error(err);
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
  <a-modal
    v-model:open="open"
    :title="t('地圖存檔智慧替換')"
    :footer="null"
    centered
    :mask-closable="!uploading"
    :width="isPhone ? '95%' : '500px'"
  >
    <div class="map-replace-container">
      <div v-if="!uploading" class="upload-area">
        <a-upload-dragger
          :multiple="false"
          :show-upload-list="false"
          :before-upload="(file: any) => { handleMapReplace(file as File); return false; }"
        >
          <p class="ant-upload-drag-icon"><CloudUploadOutlined /></p>
          <p class="ant-upload-text">{{ t('將地圖壓縮包拖入此處') }}</p>
          <p class="ant-upload-hint">{{ t('支援 .zip / .tar.gz，自動對齊維度目錄') }}</p>
        </a-upload-dragger>
      </div>

      <div v-else class="status-area">
        <div class="status-title">
          <LoadingOutlined v-if="uploadData.current" spin />
          <InteractionOutlined v-else spin />
          <span class="ml-2">
            {{ uploadData.current ? t('正在傳輸數據...') : t('正在分析並重組目錄...') }}
          </span>
        </div>

        <div v-if="uploadData.current" class="progress-box">
          <div class="flex-between mb-1">
            <span class="file-name-scroll">{{ uploadData.currentFile }}</span>
            <span>{{ progress }}%</span>
          </div>
          <a-progress 
            :percent="progress" 
            :show-info="false" 
            status="active"
            :stroke-color="{ '0%': '#1890ff', '100%': '#52c41a' }"
          />
          <div class="text-right size-info">
            {{ convertFileSize(uploadData.current[0].toString()) }} / 
            {{ convertFileSize(uploadData.current[1].toString()) }}
          </div>
        </div>
        
        <div v-else class="scan-tip">
          <a-alert :message="t('正在掃描 level.dat 並對齊 /world，請稍候...')" type="info" show-icon />
        </div>
      </div>

      <div class="footer-tips">
        <p>* {{ t('本功能會自動處理單人存檔 (DIM-1) 與伺服器分離存檔結構。') }}</p>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.map-replace-container { padding: 10px; }
.upload-area { margin: 10px 0; }
.status-area { padding: 30px 0; }
.status-title { font-size: 16px; margin-bottom: 20px; display: flex; align-items: center; justify-content: center; }
.progress-box { margin-top: 15px; }
.flex-between { display: flex; justify-content: space-between; }
.size-info { font-size: 12px; color: #999; margin-top: 4px; }
.file-name-scroll { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scan-tip { margin-top: 20px; }
.footer-tips { margin-top: 24px; text-align: center; color: #bfbfbf; font-size: 12px; }
.ml-2 { margin-left: 8px; }
:deep(.ant-upload-drag) { border-radius: 12px; background: #fafafa; }
</style>
