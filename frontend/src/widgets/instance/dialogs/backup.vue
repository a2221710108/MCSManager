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
// 引入實例詳情 API 用於檢查狀態
import { instanceInfo } from "@/services/apis/instance";
import { useScreen } from "@/hooks/useScreen";
import { FileZipOutlined, ReloadOutlined, DownloadOutlined, HistoryOutlined, ExclamationCircleOutlined } from "@ant-design/icons-vue";
import { createVNode } from "vue";
import { parseForwardAddress } from "@/tools/protocol";

const open = ref(false);
const backupFiles = ref<any[]>([]);
const backupDir = "LazyCloud_backup"; 

const { isPhone } = useScreen();
const { state: files, execute: fetchFiles, isLoading } = getFileListApi();
const { execute: executeDelete } = deleteFileApi();
const { execute: getDownloadCfg } = downloadAddress();
const { execute: executeCompress } = compressFileApi();
// 實例信息 API
const { execute: fetchInstanceInfo } = instanceInfo();

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

// --- 1. 下載功能 ---
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

// --- 2. 還原功能 (增加狀態檢測) ---
const handleRestore = (file: any) => {
  Modal.confirm({
    title: t("確認還原備份？"),
    icon: createVNode(ExclamationCircleOutlined),
    content: createVNode("div", { style: "color:red;" }, t("警告：這將刪除根目錄下除 LazyCloud_backup 資料夾以外的所有東西，並還原此備份檔案！")),
    okText: t("確認還原"),
    cancelText: t("取消"),
    okType: "danger",
    onOk: async () => {
      const msgKey = "restore_task";
      try {
        // --- 核心修改：狀態檢測 ---
        message.loading({ content: t("正在檢查伺服器狀態..."), key: msgKey });
        const info = await fetchInstanceInfo({
          params: { daemonId: props.daemonId, uuid: props.instanceId }
        });

        // 狀態碼說明：通常 0 是停止 (STOPPED)，其他均視為未關閉
        // 注意：請根據您實際的 API 返回結構調整，這裡假設是 info.value.status
        const status = info.value?.status;
        if (status !== 0) {
          return Modal.warning({
            title: t("無法執行還原"),
            content: t("伺服器目前正在運行中或處於異常狀態。為了數據安全，請先關閉伺服器後再嘗試還原操作。"),
            okText: t("知道了")
          });
        }
        // -----------------------

        message.loading({ content: t("正在清理伺服器環境..."), key: msgKey });

        // 第一步：獲取根目錄文件列表
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

        // 第二步：刪除現有文件
        if (targetsToDelete.length > 0) {
          await executeDelete({
            params: { daemonId: props.daemonId, uuid: props.instanceId },
            data: { targets: targetsToDelete }
          });
        }

        // 第三步：執行第一階段解壓 (gz -> tar)
        message.loading({ content: t("正在執行第一階段解壓 (Gzip)..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: {
            type: 2,
            code: "utf-8",
            source: "/" + backupDir + "/" + file.name,
            targets: "/" 
          }
        });

        // 第四步：自動處理二次拆包
        const tarFileName = file.name.replace(/\.gz$/i, "");
        if (tarFileName.endsWith(".tar")) {
          message.loading({ content: t("正在執行第二階段拆包 (Tar)..."), key: msgKey });
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
            await executeDelete({
              params: { daemonId: props.daemonId, uuid: props.instanceId },
              data: { targets: ["/" + tarFileName] }
            });
          } catch (tarErr) {
            console.warn("二次解壓失敗或檔案不存在", tarErr);
          }
        }

        message.success({ content: t("還原成功！伺服器已恢復。"), key: msgKey });
        open.value = false;
      } catch (err: any) {
        message.error({ content: t("還原過程中出錯: ") + err.message, key: msgKey });
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
.backup-container { min-height: 300px; }
.backup-list { max-height: 500px; overflow-y: auto; }
</style>
