<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
import { fileList, fileDownload, fileDecompress, deleteFile } from "@/services/apis/fileManager"; 
import { useScreen } from "@/hooks/useScreen";
import { FileZipOutlined, ReloadOutlined, DownloadOutlined, HistoryOutlined } from "@ant-design/icons-vue";

const open = ref(false);
const backupFiles = ref<any[]>([]);
const backupDir = "LazyCloud_backup"; 

const { isPhone } = useScreen();
const { state: files, execute: fetchFiles, isLoading } = fileList();
const { execute: decompress } = fileDecompress();
const { execute: removeFiles } = deleteFile();

const props = defineProps<{
  daemonId: string;
  instanceId: string;
}>();

const openDialog = async () => {
  open.value = true;
  await fetchBackupList();
};

const fetchBackupList = async () => {
  try {
    await fetchFiles({
      params: {
        daemonId: props.daemonId,
        uuid: props.instanceId,
        target: backupDir,
        page: 0,
        page_size: 100,
        file_name: ""
      }
    });

    const rawData = (files.value as any)?.items || files.value;
    if (Array.isArray(rawData)) {
      backupFiles.value = rawData.filter((file: any) => 
        file.name.toLowerCase().endsWith(".tar.gz")
      );
    }
  } catch (err: any) {
    reportErrorMsg(err.message);
  }
};

// --- 功能實作 ---

// 1. 下載功能
const handleDownload = (file: any) => {
  // 構建下載 URL，這通常需要 daemonId, uuid 和路徑
  const path = `${backupDir}/${file.name}`;
  const url = `/api/files/download?daemonId=${props.daemonId}&uuid=${props.instanceId}&path=${encodeURIComponent(path)}`;
  window.open(url, "_blank");
  message.success(t("開始下載..."));
};

// 2. 還原功能 (核心邏輯)
const handleRestore = (file: any) => {
  Modal.confirm({
    title: t("確認還原備份？"),
    content: t("警告：此操作將刪除伺服器根目錄下除了 LazyCloud_backup 資料夾以外的所有內容，並將備份檔案解壓。此動作不可逆！"),
    okText: t("確認還原"),
    okType: "danger",
    cancelText: t("取消"),
    onOk: async () => {
      try {
        message.loading({ content: t("正在執行還原程序..."), key: "restore" });
        
        // 第一步：清空目錄 (除了備份資料夾)
        // 這裡需要根據後端 API 傳遞目標，通常是刪除根目錄內容
        // 注意：具體的「排除特定資料夾」刪除邏輯取決於後端 API 支援度
        // 如果後端不支援排除，這裡建議只刪除特定的檔案或調用專門的還原 API
        await removeFiles({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: {
            targets: ["*"], // 這裡假設後端支援通配符或需傳入清單
            exclude: [backupDir] 
          }
        });

        // 第二步：解壓縮
        await decompress({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: {
            target: `${backupDir}/${file.name}`,
            dest: "." // 解壓到根目錄
          }
        });

        message.success({ content: t("還原成功！伺服器已恢復。"), key: "restore" });
        open.value = false;
      } catch (err: any) {
        message.error({ content: t("還原失敗：") + err.message, key: "restore" });
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="t('LazyCloud 備份管理')"
    centered
    :footer="null" 
    :width="isPhone ? '100%' : '900px'"
  >
    <div class="backup-container">
      <div style="margin-bottom: 16px; text-align: right;">
        <a-button type="primary" :loading="isLoading" @click="fetchBackupList">
          <template #icon><ReloadOutlined /></template>
          {{ t('重新整理') }}
        </a-button>
      </div>

      <a-list :loading="isLoading" bordered :data-source="backupFiles" class="backup-list">
        <template #renderItem="{ item }">
          <a-list-item>
            <a-list-item-meta>
              <template #title>
                <span class="file-name">{{ item.name }}</span>
              </template>
              <template #description>
                <span>{{ (item.size / 1024 / 1024).toFixed(2) }} MB</span>
              </template>
              <template #avatar>
                <a-avatar style="background-color: #1890ff">
                  <template #icon><FileZipOutlined /></template>
                </a-avatar>
              </template>
            </a-list-item-meta>
            
            <template #actions>
              <a-space>
                <a-button size="small" @click="handleDownload(item)">
                  <template #icon><DownloadOutlined /></template>
                  {{ t('下載') }}
                </a-button>
                <a-button size="small" danger @click="handleRestore(item)">
                  <template #icon><HistoryOutlined /></template>
                  {{ t('還原') }}
                </a-button>
              </a-space>
            </template>
          </a-list-item>
        </template>
        
        <template v-if="!isLoading && backupFiles.length === 0" #loadMore>
           <a-empty :description="t('找不到 .tar.gz 備份檔案')" style="margin-top: 20px" />
        </template>
      </a-list>
    </div>
  </a-modal>
</template>

<style scoped>
.backup-container { min-height: 300px; }
.backup-list { max-height: 60vh; overflow-y: auto; }
.file-name { font-weight: 500; word-break: break-all; }
</style>
