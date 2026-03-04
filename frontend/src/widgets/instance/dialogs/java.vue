<script setup lang="ts">
import { ref } from "vue";
import type { OpenMarketDialogProps } from "@/components/fc";
import { useDialog } from "@/hooks/useDialog";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import { Modal, message, Select, Button } from "ant-design-vue";

// 修正後的 Props 接口：兼容 ManagerBtns.vue 調用
interface Props extends OpenMarketDialogProps {
  instanceId?: string;
  daemonId?: string;
  destroyComponent?: () => void;
  emitResult?: (res: any) => void;
}

const props = defineProps<Props>();

// 使用 useDialog 控制彈窗顯示
const { isVisible, openDialog: open, cancel, submit } = useDialog<any>(props as any);

// Java 版本與啟動指令的映射配置
const selectedJavaVersion = ref<string>("17");
const javaVersions = [
  { label: "Java 6", value: "6", shell: "./start_6_mc.sh" },
  { label: "Java 8", value: "8", shell: "./start_8_mc.sh" },
  { label: "Java 17", value: "17", shell: "./start_17_mc.sh" },
  { label: "Java 21", value: "21", shell: "./start_21_mc.sh" },
];

const openDialog = async () => {
  return await open();
};

const handleConfirm = async () => {
  // 獲取對應版本的啟動腳本名稱
  const targetShell = javaVersions.find(v => v.value === selectedJavaVersion.value)?.shell || "./start.sh";

  if (!props.instanceId || !props.daemonId) {
    message.error(t("無法獲取實例信息"));
    return;
  }

  Modal.confirm({
    title: t("確認變更環境"),
    content: `${t("系統將自動將啟動指令修改為")}: ${targetShell}。${t("確認執行嗎？")}`,
    okText: t("確認修改"),
    cancelText: t("取消"),
    async onOk() {
      try {
        // 直接調用後端 API 更新 startCommand
        await updateInstanceConfig().execute({
          params: {
            daemonId: props.daemonId || "",
            uuid: props.instanceId || ""
          },
          data: {
            startCommand: targetShell
          }
        });
        
        message.success(t("啟動指令已成功更新"));
        // 任務完成，通知父組件並關閉對話框
        await submit(true);
      } catch (err: any) {
        console.error(err);
        return reportErrorMsg(err.message);
      }
    }
  });
};

defineExpose({
  openDialog
});
</script>

<template>
  <a-modal
    v-model:open="isVisible"
    centered
    :title="dialogTitle || t('Java 運行環境配置')"
    :footer="null"
    :mask-closable="false"
    width="500px"
    @cancel="cancel"
  >
    <div class="java-selector-container">
      <div class="selector-label">
        <span class="star">*</span>
        {{ t('選擇 Java 版本') }}:
      </div>
      
      <a-select 
        v-model:value="selectedJavaVersion" 
        style="width: 100%"
        size="large"
      >
        <a-select-option v-for="opt in javaVersions" :key="opt.value" :value="opt.value">
          {{ opt.label }} —— ({{ opt.shell }})
        </a-select-option>
      </a-select>

      <div class="hint-text">
        {{ t('切換後將自動修改實例的啟動命令，請確保服務器路徑下存在對應的 .sh 腳本。') }}
      </div>

      <div class="action-footer">
        <a-button size="large" @click="cancel" style="margin-right: 12px;">
          {{ t('取消') }}
        </a-button>
        <a-button type="primary" size="large" @click="handleConfirm">
          {{ t('確認修改') }}
        </a-button>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.java-selector-container {
  padding: 10px 0;
}

.selector-label {
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.star {
  color: #ff4d4f;
  margin-right: 4px;
}

.hint-text {
  margin-top: 16px;
  padding: 10px;
  background-color: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 4px;
  font-size: 13px;
  color: #d46b08;
}

.action-footer {
  margin-top: 32px;
  text-align: right;
}
</style>
