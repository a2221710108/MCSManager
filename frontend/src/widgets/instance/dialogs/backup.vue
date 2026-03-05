<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
import { 
  fileList as getFileListApi, 
  deleteFile as deleteFileApi, 
  downloadAddress,
  compressFile as compressFileApi 
} from "@/services/apis/fileManager";
import { getInstanceInfo } from "@/services/apis/instance";
import { useScreen } from "@/hooks/useScreen";
import { FileZipOutlined, ReloadOutlined, DownloadOutlined, HistoryOutlined, ExclamationCircleOutlined } from "@ant-design/icons-vue";
import { createVNode } from "vue";
import { parseForwardAddress } from "@/tools/protocol";

// 定義延遲函數
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const open = ref(false);
const backupFiles = ref<any[]>([]);
const backupDir = "LazyCloud_backup"; 

const { isPhone } = useScreen();
const { state: files, execute: fetchFiles, isLoading } = getFileListApi();
const { execute: executeDelete } = deleteFileApi();
const { execute: getDownloadCfg } = downloadAddress();
const { execute: executeCompress } = compressFileApi();
const { execute: fetchInstanceInfo } = getInstanceInfo();

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
        target: backupDir + "/",
        page: 0,
        page_size: 100,
        file_name: ""
      }
    });
    const rawData = files.value?.items;
    if (Array.isArray(rawData)) {
      backupFiles.value = rawData.filter((file: any) => 
        file.name.toLowerCase().endsWith(".tar.gz")
      );
    }
  } catch (err: any) {
    reportErrorMsg(err.message);
  }
};

const handleDownload = async (file: any) => {
  try {
    const fullPath = backupDir + "/" + file.name;
    const res = await getDownloadCfg({
      params: {
        file_name: fullPath,
        daemonId: props.daemonId,
        uuid: props.instanceId
      }
    });
    if (res.value) {
      const link = `${parseForwardAddress(res.value.addr, "http")}/download/${res.value.password}/${file.name}`;
      window.open(link);
    }
  } catch (err: any) {
    reportErrorMsg(err.message);
  }
};

const handleRestore = (file: any) => {
  Modal.confirm({
    title: t("確認還原備份？"),
    icon: createVNode(ExclamationCircleOutlined),
    content: createVNode("div", { style: "color:red;" }, t("警告：這將刪除伺服器根目錄所有檔案，並還原此備份！")),
    okText: t("確認還原"),
    cancelText: t("取消"),
    okType: "danger",
    onOk: async () => {
      const msgKey = "restore_task";
      try {
        message.loading({ content: t("正在檢查伺服器狀態..."), key: msgKey });
        const info = await fetchInstanceInfo({
          params: { daemonId: props.daemonId, uuid: props.instanceId }
        });

        if (info.value?.status !== 0) {
          return Modal.warning({
            title: t("無法還原"),
            content: t("請先關閉伺服器後再執行還原。"),
            okText: t("知道了")
          });
        }

        message.loading({ content: t("正在清理伺服器環境..."), key: msgKey });
        const rootRes = await fetchFiles({
          params: {
            daemonId: props.daemonId,
            uuid: props.instanceId,
            target: "/",
            page: 0,
            page_size: 100,
            file_name: ""
          }
        });

        const targetsToDelete = rootRes.value?.items
          ?.filter((item: any) => item.name !== backupDir)
          .map((item: any) => "/" + item.name) || [];

        if (targetsToDelete.length > 0) {
          await executeDelete({
            params: { daemonId: props.daemonId, uuid: props.instanceId },
            data: { targets: targetsToDelete }
          });
        }

        // --- 第一階段：解壓 Gzip ---
        message.loading({ content: t("正在執行第一階段解壓..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: {
            type: 2,
            code: "utf-8",
            source: "/" + backupDir + "/" + file.name,
            targets: "/" 
          }
        });

        // --- 核心改進：等待冷卻期 ---
        const tarFileName = file.name.replace(/\.gz$/i, "");
        if (tarFileName.endsWith(".tar")) {
          message.loading({ content: t("請稍等..."), key: msgKey });
          await sleep(3500); // 等待 3.5 秒，確保繞過 2 秒的限制

          message.loading({ content: t("正在執行第二階段拆包..."), key: msgKey });
          try {
            await executeCompress({
              params: { uuid: props.instanceId, daemonId: props.daemonId },
              data: {
                type: 2,
                code: "utf-8",
                source: "/" + tarFileName,
                targets: "/"
              }
            });

            // 再次等待 1 秒後刪除臨時檔，防止刪除操作也被冷卻攔截
            await sleep(1000); 
            await executeDelete({
              params: { daemonId: props.daemonId, uuid: props.instanceId },
              data: { targets: ["/" + tarFileName] }
            });
          } catch (tarErr: any) {
            console.error("二次解壓失敗:", tarErr);
            message.error(t("二次解壓失敗: ") + (tarErr.response?.data || tarErr.message));
          }
        }

        message.success({ content: t("還原成功！"), key: msgKey });
        open.value = false;
      } catch (err: any) {
        message.error({ content: t("還原失敗: ") + (err.response?.data || err.message), key: msgKey });
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
    :width="isPhone ? '95%' : '800px'"
    :body-style="{ padding: isPhone ? '12px' : '24px' }"
  >
    <div class="backup-container">
      <div class="info-banner">
        <a-typography-paragraph class="info-text">
          <div class="info-item">
            <info-circle-outlined class="info-icon" />
            <span>{{ t("此處僅展示伺服器內的本地備份。") }}</span>
          </div>
          <div class="info-item secondary">
            <cloud-server-outlined class="info-icon" />
            <span>{{ t("備份（上限 2 個）已同步至新加坡 LazyCloud 節點。") }}</span>
          </div>
        </a-typography-paragraph>
      </div>

      <div class="toolbar">
        <a-button :loading="isLoading" type="primary" ghost @click="fetchBackupList" :block="isPhone">
          <template #icon><ReloadOutlined /></template>
          {{ t('重新整理列表') }}
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
          <a-list-item class="responsive-list-item">
            <a-list-item-meta>
              <template #title>
                <span class="file-name">{{ item.name }}</span>
              </template>
              <template #description>
                <div class="file-meta">
                  <span class="meta-tag">{{ (item.size / 1024 / 1024).toFixed(2) }} MB</span>
                  <a-divider type="vertical" />
                  <span class="meta-time">{{ item.time }}</span>
                </div>
              </template>
              <template #avatar>
                <a-avatar class="file-icon" :size="isPhone ? 'default' : 'large'">
                  <template #icon><FileZipOutlined /></template>
                </a-avatar>
              </template>
            </a-list-item-meta>

            <template #actions>
              <div class="action-buttons">
                <a-button class="action-btn" size="middle" @click="handleDownload(item)">
                  <template #icon><DownloadOutlined /></template>
                  <span v-if="!isPhone">{{ t('下載') }}</span>
                </a-button>
                <a-button class="action-btn" size="middle" danger @click="handleRestore(item)">
                  <template #icon><HistoryOutlined /></template>
                  <span v-if="!isPhone">{{ t('還原') }}</span>
                  <span v-else>{{ t('還原') }}</span> 
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
.backup-container {
  display: flex;
  flex-direction: column;
}

/* 頂部橫幅優化 */
.info-banner {
  background: #f0f5ff;
  border-left: 4px solid #1890ff;
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.info-text {
  margin-bottom: 0 !important;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #262626;
  font-size: 14px;
}

.info-item.secondary {
  margin-top: 4px;
  color: #8c8c8c;
  font-size: 12px;
}

.info-icon {
  color: #1890ff;
}

.toolbar {
  margin-bottom: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 列表區域 */
.backup-list {
  max-height: 55vh; /* 使用螢幕高度百分比，避免手機上溢出 */
  overflow-y: auto;
  border-radius: 8px;
}

.file-name {
  word-break: break-all; /* 防止長檔名撐開 */
  font-weight: 600;
  color: #262626;
}

.file-meta {
  font-size: 13px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.file-icon {
  background-color: #e6f7ff;
  color: #1890ff;
}

/* 響應式佈局核心 */
.responsive-list-item {
  transition: background 0.3s;
  padding: 12px 16px !important;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

/* 當寬度小於 576px (手機) 時的樣式調整 */
@media (max-width: 576px) {
  .responsive-list-item {
    flex-direction: column; /* 讓 actions 換行 */
    align-items: flex-start !important;
  }

  :deep(.ant-list-item-action) {
    margin-inline-start: 0 !important;
    margin-top: 12px;
    width: 100%;
  }

  .action-buttons {
    width: 100%;
    justify-content: flex-start;
  }

  .action-btn {
    flex: 1; /* 手機上按鈕平分寬度，更好點擊 */
    justify-content: center;
  }
  
  .toolbar {
    justify-content: center;
  }
}
</style>
