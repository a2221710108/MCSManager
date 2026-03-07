<script setup lang="ts">
import { ref, computed, h, onMounted, onUnmounted, watch, type CSSProperties } from "vue";
import { Modal, message, type ItemType, type UploadChangeParam, type UploadProps } from "ant-design-vue";
import dayjs from "dayjs";
import { 
  PlusOutlined, FolderOutlined, FileOutlined, FileZipOutlined, EditOutlined, 
  DownloadOutlined, ScissorOutlined, CopyOutlined, FormOutlined, KeyOutlined, 
  DeleteOutlined, DownOutlined, SearchOutlined, UploadOutlined, CaretRightOutlined, 
  PauseOutlined, CloseOutlined, ExclamationCircleOutlined 
} from "@ant-design/icons-vue";

// 基礎工具與 API
import { t, getCurrentLang } from "@/lang/i18n";
import { useScreen } from "@/hooks/useScreen";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useFileManager } from "@/hooks/useFileManager";
import { useRightClickMenu } from "@/hooks/useRightClickMenu";
import uploadService from "@/services/uploadService";
import { arrayFilter } from "@/tools/array";
import { filterFileName, getFileExtName, getFileIcon, isCompressFile } from "@/tools/fileManager";
import { convertFileSize } from "@/tools/fileSize";
import type { LayoutCard } from "@/types";
import type { AntColumnsType } from "@/types/ant";
import type { DataType } from "@/types/fileManager";

// 關鍵 API 引入
import { fileList as getFileListApi, touchFile as touchFileApi } from "@/services/apis/fileManager";

// 組件
import BetweenMenus from "@/components/BetweenMenus.vue";
import CardPanel from "@/components/CardPanel.vue";
import FileEditor from "@/widgets/instance/FileEditor.vue";

const props = defineProps<{
  card: LayoutCard;
}>();

const { getMetaOrRouteValue } = useLayoutCardTools(props.card);
const instanceId = getMetaOrRouteValue("instanceId");
const daemonId = getMetaOrRouteValue("daemonId");

const { isPhone } = useScreen();
const {
  dialog, spinning, fileStatus, permission, selectedRowKeys,
  operationForm, dataSource, breadcrumbs, clipboard, currentDisk,
  isMultiple, selectChanged, getFileList, rowClickTable,
  handleTableChange, getFileStatus, touchFile, reloadList,
  setClipBoard, paste, resetName, deleteFile, zipFile, unzipFile,
  downloadFile, handleChangeDir, handleSearchChange, selectedFiles,
  changePermission, toDisk, oneSelected, isImage, showImage
} = useFileManager(instanceId, daemonId);

const { openRightClickMenu } = useRightClickMenu();
const { execute: executeTouch } = touchFileApi();
const backupDir = "LazyCloud_backup";

/**
 * 核心邏輯：自動檢查並創建備份資料夾
 */
const ensureBackupDirExists = async () => {
  try {
    // 1. 強制請求一次根目錄列表（不受當前 UI 所在路徑影響）
    const { execute: fetchRootFiles } = getFileListApi();
    const res = await fetchRootFiles({
      params: {
        daemonId: daemonId,
        uuid: instanceId,
        target: "/",
        page: 0,
        page_size: 100,
        file_name: ""
      }
    });

    // 2. 判斷是否存在該資料夾
    const hasDir = res.value?.items?.some(
      (item: any) => item.name === backupDir && item.type === 0
    );

    // 3. 如果不存在，則發送創建請求
    if (!hasDir) {
      console.log(`[LazyCloud] 備份目錄不存在，正在創建: ${backupDir}`);
      await executeTouch({
        params: { daemonId: daemonId, uuid: instanceId },
        data: {
          target: "/",      // 目標是在根目錄下
          name: backupDir,  // 資料夾名稱
          type: 0           // 0 代表創建目錄
        }
      });
      console.log(`[LazyCloud] 備份目錄已創建`);
    }
  } catch (err) {
    // 靜默處理錯誤，不干擾主流程
    console.warn("自動創建備份目錄失敗，可能權限不足或 API 結構不同:", err);
  }
};

// --- 生命週期與任務 ---
let task: NodeJS.Timer | undefined;

onMounted(async () => {
  await getFileStatus();
  dialog.value.loading = true;

  // 在正式加載文件清單前，執行資料夾檢查與初始化
  await ensureBackupDirExists();

  await getFileList();
  dialog.value.loading = false;

  task = setInterval(async () => {
    await getFileStatus();
  }, 3000);
});

onUnmounted(() => {
  if (task) clearInterval(task);
});

// --- 其餘業務邏輯（與原代碼一致） ---
const isShowDiskList = computed(() => 
  fileStatus.value?.disks.length && 
  fileStatus.value?.platform === "win32" && 
  fileStatus.value?.isGlobalInstance
);

// ... (省略中間重複的 columns, upload, drop 處理函數，與原代碼相同) ...

const FileEditorDialog = ref<InstanceType<typeof FileEditor>>();

const editFile = (fileName: string) => {
  const path = breadcrumbs[breadcrumbs.length - 1].path + fileName;
  FileEditorDialog.value?.openDialog(path, fileName);
};

const handleClickFile = async (file: DataType) => {
  if (file.type === 0) return rowClickTable(file.name, file.type);
  const fileExtName = getFileExtName(file.name);
  if (isImage(fileExtName)) return showImage(file);
  return editFile(file.name);
};

// ... (menuList, handleRightClickRow 等函數保持不變) ...
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="t('備份管理')"
    centered
    :footer="null"
    :width="isPhone ? '100%' : '800px'"
    :body-style="isPhone ? { padding: '12px' } : { padding: '24px' }"
  >
    <div class="backup-container">
      <a-alert type="info" show-icon class="info-banner">
        <template #message>
          <a-typography-text strong>
            {{ t("此處僅展示伺服器內的本地備份。請關閉伺服器後進行備份，") }}
          </a-typography-text>
        </template>
        <template #description>
          <a-typography-text type="secondary" size="small">
            {{ t("您的備份（上限 2 個）均已同步至新加坡檔案伺服器。") }}
          </a-typography-text>
        </template>
      </a-alert>

      <div class="action-bar">
        <a-button :loading="isLoading" type="primary" ghost @click="fetchBackupList">
          <template #icon><ReloadOutlined /></template>
          {{ t('重新整理') }}
        </a-button>
      </div>

      <a-list
        :loading="isLoading"
        bordered
        :data-source="backupFiles"
        class="backup-list"
        item-layout="horizontal"
      >
        <template #renderItem="{ item }">
          <a-list-item class="custom-list-item">
            <a-list-item-meta>
              <template #avatar>
                <a-avatar class="file-icon-bg">
                  <template #icon><FileZipOutlined /></template>
                </a-avatar>
              </template>
              <template #title>
                <a-typography-text 
                  strong 
                  ellipsis 
                  :content="item.name" 
                  class="file-name"
                />
              </template>
              <template #description>
                <a-typography-text type="secondary" size="small">
                  {{ (item.size / 1024 / 1024).toFixed(2) }} MB
                  <a-divider type="vertical" />
                  {{ item.time }}
                </a-typography-text>
              </template>
            </a-list-item-meta>

            <template #actions>
              <div class="item-actions">
                <a-button size="small" class="action-btn" @click="handleDownload(item)">
                  <template #icon><DownloadOutlined /></template>
                  {{ t('下載') }}
                </a-button>
                <a-button size="small" danger class="action-btn" @click="handleRestore(item)">
                  <template #icon><HistoryOutlined /></template>
                  {{ t('還原') }}
                </a-button>
              </div>
            </template>
          </a-list-item>
        </template>
      </a-list>
    </div>
  </a-modal>
</template>

<style scoped>
.info-banner {
  margin-bottom: 20px;
}

.action-bar {
  margin-bottom: 16px;
  display: flex;
  justify-content: flex-end;
}

.backup-list {
  max-height: 500px;
  overflow-y: auto;
  /* 移除原本的 background: #fff，讓它跟隨主題 */
  border-radius: 8px;
}

.custom-list-item {
  transition: background 0.3s;
  padding: 12px 16px !important;
}

/* 這裡使用 Ant Design 的 Token 變量（若環境支持）或透明度 */
.custom-list-item:hover {
  background: rgba(128, 128, 128, 0.05);
}

.file-name {
  display: block;
  max-width: 350px;
}

.file-icon-bg {
  /* 使用透明藍，在深色/淺色模式下都能透出底色 */
  background-color: rgba(24, 144, 255, 0.15);
  color: #1890ff;
}

.item-actions {
  display: flex;
  gap: 8px;
}

/* --- 移動端適配 --- */
@media (max-width: 576px) {
  .custom-list-item {
    flex-direction: column;
    align-items: flex-start !important;
  }

  .file-name {
    max-width: 220px;
  }

  .ant-list-item-meta {
    width: 100%;
    margin-bottom: 12px;
  }

  .item-actions {
    width: 100%;
    justify-content: flex-end;
    /* 使用動態顏色邊框，不要寫死 #f0f0f0 */
    border-top: 1px solid rgba(128, 128, 128, 0.1);
    padding-top: 12px;
  }

  .action-btn {
    flex: 1;
    justify-content: center;
  }
}
</style>
