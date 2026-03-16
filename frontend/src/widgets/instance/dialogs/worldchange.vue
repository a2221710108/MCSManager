<script setup lang="ts">
import { ref, createVNode } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
import { 
  fileList as getFileListApi, 
  deleteFile as deleteFileApi, 
  compressFile as compressFileApi,
  uploadAddress 
} from "@/services/apis/fileManager";
import { getInstanceInfo } from "@/services/apis/instance";
import { useScreen } from "@/hooks/useScreen";
import { CloudUploadOutlined, WarningOutlined, InteractionOutlined } from "@ant-design/icons-vue";
import uploadService from "@/services/uploadService";
import { parseForwardAddress } from "@/tools/protocol";

const open = ref(false);
const uploading = ref(false);
const { isPhone } = useScreen();

const props = defineProps<{
  daemonId: string;
  instanceId: string;
}>();

// API 實作初始化
const { execute: fetchFiles } = getFileListApi();
const { execute: executeDelete } = deleteFileApi();
const { execute: executeCompress } = compressFileApi();
const { execute: fetchInstanceInfo } = getInstanceInfo();
const { execute: getUploadMissionCfg } = uploadAddress();

const openDialog = () => {
  open.value = true;
};

// 遞歸掃描函數：尋找包含 level.dat 的目錄
const findWorldDir = async (targetPath: string): Promise<string | null> => {
  try {
    const res = await fetchFiles({
      params: { 
        daemonId: props.daemonId, 
        uuid: props.instanceId, 
        target: targetPath, 
        page: 0, 
        page_size: 100, 
        file_name: "" 
      }
    });
    const items = res.value?.items || [];
    
    // 檢查是否有 level.dat
    if (items.some((item: any) => item.name === "level.dat")) {
      return targetPath;
    }

    // 掃描子目錄 (type === 1 代表資料夾)
    for (const item of items) {
      if (item.type === 1) { 
        const found = await findWorldDir(`${targetPath}${item.name}/`);
        if (found) return found;
      }
    }
  } catch {
    return null;
  }
  return null;
};

const handleMapReplace = async (file: File) => {
  const msgKey = "map_replace_task";
  
  // 1. 伺服器狀態預檢
  const info = await fetchInstanceInfo({ params: { daemonId: props.daemonId, uuid: props.instanceId } });
  if (info.value?.status !== 0) {
    return Modal.warning({ 
      title: t("伺服器運行中"), 
      content: t("請先關閉伺服器後再進行地圖替換，以確保檔案不被佔用。") 
    });
  }

  Modal.confirm({
    title: t("確認快速替換地圖？"),
    icon: createVNode(WarningOutlined),
    content: t("這將會刪除目前的 world 資料夾，並從上傳的壓縮包中自動提取地圖數據。"),
    onOk: async () => {
      try {
        uploading.value = true;
        const tempDirName = `tmp_map_${Date.now()}`;
        
        // --- 階段 A: 獲取上傳授權 ---
        message.loading({ content: t("正在準備上傳通道..."), key: msgKey });
        const mission = await getUploadMissionCfg({
          params: {
            upload_dir: "/",
            daemonId: props.daemonId,
            uuid: props.instanceId,
            file_name: file.name
          }
        });

        // 核心修復：確保 mission.value 存在並緩存，解決 TS18048 報錯
        const config = mission.value;
        if (!config || !config.addr || !config.password) {
          throw new Error("無法獲取上傳地址配置。");
        }

        // --- 階段 B: 執行上傳 ---
        message.loading({ content: t("正在傳輸數據..."), key: msgKey });
        
        await new Promise((resolve) => {
          uploadService.append(
            file,
            parseForwardAddress(config.addr, "http"),
            config.password,
            { overwrite: true },
            (task) => {
              task.instanceInfo = { 
                instanceId: props.instanceId, 
                daemonId: props.daemonId 
              };
              // 給予短暫延遲確保檔案寫入磁碟
              setTimeout(resolve, 1500); 
            }
          );
        });

        // --- 階段 C: 解壓與結構掃描 ---
        message.loading({ content: t("正在分析地圖結構..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { 
            type: 2, 
            code: "utf-8", 
            source: "/" + file.name, 
            targets: `/${tempDirName}/` 
          }
        });

        const realWorldPath = await findWorldDir(`/${tempDirName}/`);
        if (!realWorldPath) {
          throw new Error(t("無效的地圖壓縮包 (找不到 level.dat)"));
        }

        // --- 階段 D: 清理舊存檔與重組 ---
        message.loading({ content: t("正在套用新存檔..."), key: msgKey });
        
        // 刪除舊地圖
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/world", "/world_nether", "/world_the_end"] }
        });

        // 二次精準解壓到 /world/ 目錄（實現自動路徑對齊）
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { 
            type: 2, 
            code: "utf-8", 
            source: "/" + file.name, 
            targets: "/world/" 
          }
        });

        // --- 階段 E: 清理垃圾 ---
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/" + file.name, "/" + tempDirName] }
        });

        message.success({ content: t("地圖替換成功！伺服器已就緒。"), key: msgKey });
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
    :title="t('地圖存檔快速替換')"
    :footer="null"
    centered
    :mask-closable="!uploading"
    :width="isPhone ? '95%' : '520px'"
  >
    <div class="map-replace-box">
      <a-alert type="info" show-icon class="mb-4">
        <template #description>
          {{ t("支援 .zip / .tar.gz。系統會自動掃描壓縮包內部的 level.dat 並對齊資料夾路徑。") }}
        </template>
      </a-alert>

      <div class="upload-section">
        <a-upload-dragger
          :multiple="false"
          :show-upload-list="false"
          :before-upload="(file: any) => { handleMapReplace(file as File); return false; }"
          :disabled="uploading"
        >
          <p class="ant-upload-drag-icon">
            <InteractionOutlined v-if="uploading" spin />
            <CloudUploadOutlined v-else />
          </p>
          <p class="ant-upload-text">
            {{ uploading ? t('正在上傳並處理中...') : t('點擊或拖拽地圖壓縮包至此') }}
          </p>
          <p class="ant-upload-hint">{{ t('替換過程將自動清理舊的地圖資料夾') }}</p>
        </a-upload-dragger>
      </div>

      <div class="bottom-tips">
        <p><small>* {{ t("為了安全起見，建議在操作前先下載備份目前的地圖。") }}</small></p>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.upload-section { margin: 24px 0; }
.bottom-tips { text-align: center; color: #999; font-size: 12px; }
:deep(.ant-upload-drag) { border-radius: 12px; border: 2px dashed #d9d9d9; transition: border-color 0.3s; }
:deep(.ant-upload-drag:hover) { border-color: #1890ff; }
</style>
