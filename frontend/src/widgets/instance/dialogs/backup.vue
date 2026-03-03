<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
import { fileList } from "@/services/apis/fileManager";
import { useScreen } from "@/hooks/useScreen";
import { FileZipOutlined, ReloadOutlined } from "@ant-design/icons-vue";

const emit = defineEmits(["select"]);

const open = ref(false);
const backupFiles = ref<any[]>([]);
const backupDir = "LazyCloud_backup"; 

const { isPhone } = useScreen();
const { state: files, execute, isLoading } = fileList();

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
    // 根據報錯修正參數結構：所有參數都放入 params 中
    await execute({
      params: {
        daemonId: props.daemonId,
        uuid: props.instanceId,
        target: backupDir,
        page: 0,        // 補齊 API 要求的分頁參數
        page_size: 100, // 設大一點以獲取所有檔案
        file_name: ""   // 關鍵字搜尋留空
      }
    });

    // 這裡需要根據你 API 返回的實際結構（可能是 files.value.items 或 files.value）
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

const handleSelect = (file: any) => {
  emit("select", file);
  message.success(`${t('已選擇')}: ${file.name}`);
  open.value = false;
};

defineExpose({ openDialog });
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
            <a-list-item-meta>
              <template #title>
                <span class="file-name">{{ item.name }}</span>
              </template>
              <template #description>
                <span>{{ item.size ? (item.size / 1024 / 1024).toFixed(2) + ' MB' : 'N/A' }}</span>
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
