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
            {{ t("請關閉伺服器後進行備份") }}
          </a-typography-text>
        </template>
        <template #description>
          <a-typography-text type="secondary" size="small">
            {{ t("此處僅展示伺服器內的本地備份，您的備份（上限 2 個）均已同步至位於新加坡的檔案伺服器。") }}
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
