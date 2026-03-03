<script setup lang="ts">
import { computed, ref } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
import { fileList } from "@/services/apis/fileManager"; // 假設你有這個獲取列表的 API
import { useScreen } from "@/hooks/useScreen";
import { FileZipOutlined, ReloadOutlined } from "@ant-design/icons-vue";

const emit = defineEmits(["select"]);

const open = ref(false);
const backupFiles = ref<any[]>([]);
const backupDir = "LazyCloud_backup"; // 固定讀取此資料夾

const { isPhone } = useScreen();
const { state: files, execute, isLoading } = fileList(); // 切換為獲取列表的 Hook

const props = defineProps<{
  daemonId: string;
  instanceId: string;
}>();

// 打開彈窗並載入數據
const openDialog = async () => {
  open.value = true;
  await fetchBackupList();
};

const fetchBackupList = async () => {
  try {
    await execute({
      params: {
        daemonId: props.daemonId,
        uuid: props.instanceId
      },
      data: {
        target: backupDir // 請求目錄
      }
    });

    // 關鍵過濾邏輯：篩選出 .tar.gz 結尾的檔案
    if (Array.isArray(files.value)) {
      backupFiles.value = files.value.filter((file: any) => 
        file.name.toLowerCase().endsWith(".tar.gz")
      );
    }
  } catch (err: any) {
    reportErrorMsg(err.message);
  }
};

const handleSelect = (file: any) => {
  // 這裡可以根據需求觸發「還原」或「下載」
  emit("select", file);
  message.info(`${t('已選擇備份')}: ${file.name}`);
};

const close = () => {
  open.value = false;
};

defineExpose({
  openDialog
});
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="t('LazyCloud 備份管理')"
    centered
    :footer="null" 
    :width="isPhone ? '100%' : '800px'"
  >
    <div class="backup-container">
      <div style="margin-bottom: 16px; text-align: right;">
        <a-button type="primary" :loading="isLoading" @click="fetchBackupList">
          <template #icon><ReloadOutlined /></template>
          {{ t('重新整理') }}
        </a-button>
      </div>

      <a-list
        :loading="isLoading"
        bordered
        :data-source="backupFiles"
        class="backup-list"
      >
        <template #renderItem="{ item }">
          <a-list-item>
            <a-list-item-meta :description="item.size || 'N/A'">
              <template #title>
                <span class="file-name">{{ item.name }}</span>
              </template>
              <template #avatar>
                <a-avatar style="background-color: #1890ff">
                  <template #icon><FileZipOutlined /></template>
                </a-avatar>
              </template>
            </a-list-item-meta>
            <template #actions>
              <a-button type="link" @click="handleSelect(item)">
                {{ t('選擇') }}
              </a-button>
            </template>
          </a-list-item>
        </template>
        
        <template #emptyText>
          <a-empty :description="t('找不到 .tar.gz 備份檔案')" />
        </template>
      </a-list>
    </div>
  </a-modal>
</template>

<style scoped>
.backup-container {
  min-height: 400px;
}
.backup-list {
  max-height: 60vh;
  overflow-y: auto;
}
.file-name {
  font-weight: 500;
  word-break: break-all;
}
</style>
