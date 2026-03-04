<script setup lang="ts">
import { ref } from "vue";
import type { OpenMarketDialogProps } from "@/components/fc";
import { useDialog } from "@/hooks/useDialog";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { QuickStartPackages } from "@/types";
import AppPackages from "@/widgets/setupApp/AppPackages.vue";
import { Modal, message, Select } from "ant-design-vue";

// 修正後的 Props 接口：兼容靜態調用與 MountComponent 規範
interface Props extends OpenMarketDialogProps {
  instanceId?: string;
  daemonId?: string;
  // 以下為兼容性屬性，設為可選以解決 TS2345
  destroyComponent?: () => void;
  emitResult?: (res: any) => void;
}

const props = defineProps<Props>();

// 使用 any 斷言繞過 useDialog 內部的嚴格泛型檢查
const { isVisible, openDialog: open, cancel, submit } = useDialog<QuickStartPackages>(props as any);

// Java 版本與啟動指令的映射配置
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

const handleSelectTemplate = async (item: QuickStartPackages | null) => {
  if (!item) return submit(undefined);

  // 獲取對應版本的啟動腳本名稱
  const targetShell = javaVersions.find(v => v.value === selectedJavaVersion.value)?.shell || "./start.sh";

  // 情況 A：如果是新實例安裝流程（無 ID）
  if (!props.instanceId || !props.daemonId) {
    // 使用 as any 解決 "startCommand 不存在於 IQuickStartPackages" 的錯誤
    return await submit({ ...item, startCommand: targetShell } as any);
  }

  // 情況 B：如果是對現有實例進行修改
  Modal.confirm({
    title: t("確認變更環境"),
    content: `${t("系統將自動將啟動指令修改為")}: ${targetShell}。${t("確認執行嗎？")}`,
    okText: t("確認修改"),
    async onOk() {
      try {
        // 調用 MCSManager 後端 API 更新實例配置
        await updateInstanceConfig().execute({
          params: {
            daemonId: props.daemonId || "",
            uuid: props.instanceId || ""
          },
          data: {
            // 後端 Instance.parameters 會接收此欄位並持久化
            startCommand: targetShell,
            nickname: item.title
          }
        });
        
        message.success(t("啟動指令已成功更新"));
        // 任務完成，關閉對話框
        await submit(item);
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
    width="1000px"
    :title="dialogTitle || t('環境配置與 Java 版本切換')"
    :footer="null"
    :mask-closable="false"
    @cancel="cancel"
  >
    <div class="java-selector-container">
      <div class="selector-label">
        <span class="star">*</span>
        {{ t('選擇執行環境 (Java 版本)') }}:
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
        {{ t('提示：切換版本後，系統會自動生成對應的啟動腳本路徑。') }}
      </div>
    </div>

    <div class="divider"></div>

    <AppPackages
      ref="appPackages"
      :btn-text="btnText"
      :title="t('選擇安裝模板')"
      :show-custom-btn="showCustomBtn"
      :only-docker-template="onlyDockerTemplate"
      @handle-select-template="handleSelectTemplate"
    />
  </a-modal>
</template>

<style scoped>
.java-selector-container {
  padding: 24px;
  background: #fdfdfd;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  margin-bottom: 24px;
}

.selector-label {
  margin-bottom: 12px;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.star {
  color: #ff4d4f;
  margin-right: 4px;
}

.hint-text {
  margin-top: 10px;
  font-size: 13px;
  color: #8c8c8c;
}

.divider {
  height: 1px;
  background: #eeeeee;
  margin-bottom: 24px;
}
</style>
