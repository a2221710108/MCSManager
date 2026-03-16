<script setup lang="ts">
import { ref, createVNode, computed, watch } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { 
  fileList as getFileListApi, 
  deleteFile as deleteFileApi, 
  compressFile as compressFileApi,
  uploadAddress 
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

// 進度條相關計算 (參考你提供的邏輯)
const uploadData = uploadService.uiData;
const progress = computed(() => {
  if (uploadData.value.current) {
    return Math.floor((uploadData.value.current[0] * 100) / uploadData.value.current[1]);
  }
  return 0;
});

const openDialog = () => {
  open.value = true;
};

// 遞歸尋找 level.dat
const findWorldDir = async (targetPath: string): Promise<string | null> => {
  try {
    const res = await fetchFiles({
      params: { 
        daemonId: props.daemonId, uuid: props.instanceId, 
        target: targetPath, page: 0, page_size: 100, file_name: "" 
      }
    });
    const items = res.value?.items || [];
    if (items.some((item: any) => item.name === "level.dat")) return targetPath;

    for (const item of items) {
      if (item.type === 1) { 
        const found = await findWorldDir(`${targetPath}${item.name}/`);
        if (found) return found;
      }
    }
  } catch { return null; }
  return null;
};

const handleMapReplace = async (file: File) => {
  const msgKey = "map_replace_task";
  
  // 1. 預檢
  const info = await fetchInstanceInfo({ params: { daemonId: props.daemonId, uuid: props.instanceId } });
  if (info.value?.status !== 0) {
    return Modal.warning({ title: t("伺服器運行中"), content: t("請先關閉伺服器後再進行操作。") });
  }

  Modal.confirm({
    title: t("確認替換地圖？"),
    icon: createVNode(WarningOutlined),
    content: t("上傳後系統會自動解壓並對齊 /world 目錄，請確保已做好備份。"),
    onOk: async () => {
      try {
        uploading.value = true;
        const tempDirName = `tmp_map_${Date.now()}`;
        
        // --- 階段 A: 獲取上傳授權 ---
        message.loading({ content: t("正在準備通道..."), key: msgKey });
        const mission = await getUploadMissionCfg({
          params: { upload_dir: "/", daemonId: props.daemonId, uuid: props.instanceId, file_name: file.name }
        });

        const config = mission.value;
        if (!config || !config.addr || !config.password) throw new Error("授權失敗");

        // --- 階段 B: 上傳並等待監聽 ---
        message.loading({ content: t("正在上傳數據..."), key: msgKey });
        
        await new Promise<void>((resolve) => {
          uploadService.append(
            file,
            parseForwardAddress(config.addr, "http"),
            config.password,
            { overwrite: true },
            (task) => {
              task.instanceInfo = { instanceId: props.instanceId, daemonId: props.daemonId };
            }
          );

          // 核心修復：監聽 uploadService 直到 current 變為 null (完成)
          const unwatch = watch(
            () => uploadService.uiData.value.current,
            (curr) => {
              if (!curr) {
                unwatch();
                resolve();
              }
            }
          );
        });

        // --- 階段 C: 解壓與分析 ---
        message.loading({ content: t("正在解壓縮分析中..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { type: 2, code: "utf-8", source: "/" + file.name, targets: `/${tempDirName}/` }
        });

        const realWorldPath = await findWorldDir(`/${tempDirName}/`);
        if (!realWorldPath) throw new Error(t("壓縮包內找不到 level.dat"));

        // --- 階段 D: 執行替換 ---
        message.loading({ content: t("正在重組地圖目錄..."), key: msgKey });
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/world", "/world_nether", "/world_the_end"] }
        });

        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { type: 2, code: "utf-8", source: "/" + file.name, targets: "/world/" }
        });

        // --- 階段 E: 清理 ---
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/" + file.name, "/" + tempDirName] }
        });

        message.success({ content: t("地圖快速替換成功！"), key: msgKey });
        open.value = false;
      } catch (err: any) {
        message.error({ content: t("失敗: ") + err.message, key: msgKey });
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
      <div v-if="!uploading" class="upload-section">
        <a-upload-dragger
          :multiple="false"
          :show-upload-list="false"
          :before-upload="(file: any) => { handleMapReplace(file as File); return false; }"
        >
          <p class="ant-upload-drag-icon"><CloudUploadOutlined /></p>
          <p class="ant-upload-text">{{ t('點擊或拖入地圖壓縮包') }}</p>
          <p class="ant-upload-hint">{{ t('支援 .zip / .tar.gz 格式') }}</p>
        </a-upload-dragger>
      </div>

      <div v-else class="processing-section">
        <div class="status-header">
          <LoadingOutlined v-if="uploadData.current" spin />
          <InteractionOutlined v-else spin />
          <span class="ml-2">{{ uploadData.current ? t('正在上傳...') : t('正在處理文件...') }}</span>
        </div>

        <div v-if="uploadData.current" class="progress-wrapper">
          <div class="flex-between mb-1">
            <small>{{ uploadData.currentFile }}</small>
            <small>{{ progress }}%</small>
          </div>
          <a-progress 
            :percent="progress" 
            :show-info="false" 
            status="active"
            :stroke-color="{ '0%': '#108ee9', '100%': '#87d068' }"
          />
          <div class="text-right mt-1">
            <small class="text-gray">
              {{ convertFileSize(uploadData.current[0].toString()) }} / 
              {{ convertFileSize(uploadData.current[1].toString()) }}
            </small>
          </div>
        </div>

        <a-alert v-else type="info" class="mt-4">
          <template #message>{{ t('正在自動執行解壓與目錄對齊，請勿關閉視窗...') }}</template>
        </a-alert>
      </div>

      <div class="bottom-info">
        <p><small>* {{ t("本功能會自動識別 level.dat 並覆蓋 /world 目錄") }}</small></p>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.map-replace-box { padding: 12px; }
.upload-section { margin-bottom: 20px; }
.processing-section { padding: 20px 0; }
.progress-wrapper { margin-top: 20px; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.text-right { text-align: right; }
.ml-2 { margin-left: 8px; }
.mt-4 { margin-top: 16px; }
.text-gray { color: #888; }
.bottom-info { text-align: center; color: #bbb; margin-top: 10px; }
:deep(.ant-upload-drag) { border-radius: 12px; }
</style>
