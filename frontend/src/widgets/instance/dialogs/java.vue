<script setup lang="ts">
import { ref, computed } from "vue";
import type { OpenMarketDialogProps } from "@/components/fc";
import { useDialog } from "@/hooks/useDialog";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance"; // 建議使用更新配置接口
import { reportErrorMsg } from "@/tools/validator";
import type { MountComponent, QuickStartPackages } from "@/types";
import AppPackages from "@/widgets/setupApp/AppPackages.vue";
import { Modal, Select, message } from "ant-design-vue";

interface Props extends OpenMarketDialogProps, MountComponent<QuickStartPackages> {}

const props = defineProps<Props>();
const { isVisible, openDialog: open, cancel, submit } = useDialog<QuickStartPackages>(props);

// --- Java 版本配置 ---
const selectedJavaVersion = ref<string>("17");
const javaVersions = [
  { label: "Java 6", value: "6", shell: "./start_6_mc.sh" },
  { label: "Java 8", value: "8", shell: "./start_8_mc.sh" },
  { label: "Java 17", value: "17", shell: "./start_17_mc.sh" },
  { label: "Java 21", value: "21", shell: "./start_21_mc.sh" },
];

const appPackages = ref<InstanceType<typeof AppPackages>>();

const openDialog = async () => {
  appPackages.value?.init();
  return await open();
};

// 核心邏輯：根據選擇的 Java 版本修改實例的啟動指令
const handleSelectTemplate = async (item: QuickStartPackages | null) => {
  if (!item) return submit(undefined);

  // 獲取對應版本的啟動腳本
  const targetShell = javaVersions.find(v => v.value === selectedJavaVersion.value)?.shell || "./start.sh";

  if (!props.instanceId || !props.daemonId) {
    // 如果是新安裝流程，將信息併入 item 傳回父組件
    const newItem = { ...item, startCommand: targetShell };
    await submit(newItem);
    return;
  }

  // 如果是對現有實例的操作，則彈窗確認並調用接口
  Modal.confirm({
    title: t("確認變更環境"),
    content: `您選擇了 ${selectedJavaVersion.value}，系統將自動將啟動指令修改為: ${targetShell}。確認執行嗎？`,
    okText: t("確認修改"),
    async onOk() {
      try {
        // 這裡調用更新接口，後端 Instance.parameters() 會接收並持久化 startCommand
        await updateInstanceConfig().execute({
          params: {
            daemonId: props.daemonId || "",
            uuid: props.instanceId || ""
          },
          data: {
            // 核心改變：修改啟動指令
            startCommand: targetShell,
            // 保持其他原模板信息
            nickname: item.title,
          }
        });
        
        message.success(t("啟動指令已更新"));
        await submit(item);
      } catch (err: any) {
        console.error(err);
        return reportErrorMsg(err.message);
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="isVisible"
    centered
    width="1000px"
    :title="t('選擇模板與環境')"
    :footer="null"
    @cancel="cancel"
  >
    <div class="java-selector-container">
      <span style="margin-right: 12px; font-weight: bold;">{{ t('選擇執行環境 (Java):') }}</span>
      <a-select v-model:value="selectedJavaVersion" style="width: 200px">
        <a-select-option v-for="opt in javaVersions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </a-select-option>
      </a-select>
      <p class="hint-text">{{ t('注意：切換版本會修改實例的啟動腳本路徑') }}</p>
    </div>

    <hr class="divider" />

    <AppPackages
      ref="appPackages"
      :btn-text="btnText"
      :title="dialogTitle"
      :show-custom-btn="showCustomBtn"
      :only-docker-template="onlyDockerTemplate"
      @handle-select-template="handleSelectTemplate"
    />
  </a-modal>
</template>

<style scoped>
.java-selector-container {
  padding: 16px;
  background: #f9f9f9;
  border-radius: 8px;
  margin-bottom: 20px;
}
.hint-text {
  margin-top: 8px;
  font-size: 12px;
  color: #666;
}
.divider {
  border: 0;
  border-top: 1px solid #eee;
  margin-bottom: 20px;
}
</style>
