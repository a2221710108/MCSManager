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
  >
    <div class="backup-container">
      <div style="margin-bottom: 24px;">
        <a-typography-paragraph>
          <a-typography-text type="secondary">
            {{ t("此處僅顯示處理伺服器內的本地備份。您的所有備份（上限 3 個）均已上載到 LazyCloud 位於新加坡的檔案伺服器。") }}
          </a-typography-text>
          <br />
        </a-typography-paragraph>
      </div>

      <div style="margin-bottom: 16px; text-align: right;">
        <a-button :loading="isLoading" @click="fetchBackupList">
          <template #icon><ReloadOutlined /></template>
          {{ t('重新整理') }}
        </a-button>
      </div>

      <a-list :loading="isLoading" bordered :data-source="backupFiles" class="backup-list">
        <template #renderItem="{ item }">
          <a-list-item>
            <a-list-item-meta>
              <template #title>{{ item.name }}</template>
              <template #description>
                {{ (item.size / 1024 / 1024).toFixed(2) }} MB | {{ item.time }}
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
      </a-list>
    </div>
  </a-modal>
</template>

<style scoped>
.backup-list { max-height: 500px; overflow-y: auto; }
</style>
