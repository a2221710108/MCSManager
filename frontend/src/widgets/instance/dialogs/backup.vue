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
    :width="isPhone ? '100%' : '800px'"
    :body-style="isPhone ? { padding: '12px' } : {}"
  >
    <div class="backup-container">
      <div class="info-banner">
        <info-circle-outlined class="info-icon" />
        <div class="info-content">
          <p class="main-tip">{{ t("此處僅展示伺服器內的本地備份。") }}</p>
          <p class="sub-tip">
            {{ t("您的備份（上限 2 個）均已同步至新加坡檔案伺服器。") }}
          </p>
        </div>
      </div>

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
              <template #title>
                <span class="file-name" :title="item.name">{{ item.name }}</span>
              </template>
              <template #description>
                <span class="file-meta">
                  {{ (item.size / 1024 / 1024).toFixed(2) }} MB 
                  <a-divider type="vertical" /> 
                  {{ item.time }}
                </span>
              </template>
              <template #avatar>
                <a-avatar class="file-icon-bg">
                  <template #icon><FileZipOutlined /></template>
                </a-avatar>
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
/* 頂部提示橫幅 */
.info-banner {
  background-color: #f0f7ff;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  border: 1px solid #bae7ff;
}
.info-icon { color: #1890ff; margin-top: 4px; }
.info-content p { margin: 0; line-height: 1.5; }
.main-tip { font-weight: 500; color: #262626; }
.sub-tip { font-size: 12px; color: #8c8c8c; }

/* 操作欄 */
.action-bar {
  margin-bottom: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 列表優化 */
.backup-list {
  max-height: 500px;
  overflow-y: auto;
  background: #fff;
}

.custom-list-item {
  transition: background 0.3s;
  padding: 12px 16px !important;
}

.custom-list-item:hover {
  background: #fafafa;
}

/* 檔名溢出處理 */
.file-name {
  display: block;
  font-weight: 600;
  color: #262626;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 350px; /* 電腦端限制 */
}

.file-meta {
  font-size: 12px;
  white-space: nowrap;
}

.file-icon-bg {
  background-color: #e6f7ff;
  color: #1890ff;
}

/* 按鈕組佈局 */
.item-actions {
  display: flex;
  gap: 8px;
}

/* --- 移動端適配 --- */
@media (max-width: 576px) {
  .info-banner { padding: 10px; }
  
  .custom-list-item {
    flex-direction: column; /* 讓內容與按鈕上下排列 */
    align-items: flex-start !important;
  }
  
  .file-name {
    max-width: 220px; /* 手機端更窄 */
  }

  .ant-list-item-meta {
    width: 100%;
    margin-bottom: 12px;
  }

  .item-actions {
    width: 100%;
    justify-content: flex-end; /* 按鈕靠右 */
    border-top: 1px solid #f0f0f0;
    padding-top: 12px;
  }
  
  .action-btn {
    flex: 1; /* 手機端按鈕平分寬度，更好點擊 */
    justify-content: center;
  }
}
</style>
