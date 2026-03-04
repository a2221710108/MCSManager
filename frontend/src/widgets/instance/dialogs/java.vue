<script setup lang="ts">
import { ref } from "vue";
import type { OpenMarketDialogProps } from "@/components/fc";
import { useDialog } from "@/hooks/useDialog";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { QuickStartPackages } from "@/types";
import AppPackages from "@/widgets/setupApp/AppPackages.vue";
import { Modal, message } from "ant-design-vue";

// 修正後的 Props 接口，解決 TS2345 錯誤
interface Props extends OpenMarketDialogProps {
  instanceId?: string;
  daemonId?: string;
  // 以下屬性是為了兼容 MountComponent 接口，設為可選以通過編譯
  destroyComponent?: () => void;
  emitResult?: (res: any) => void;
}

const props = defineProps<Props>();

// 使用 useDialog 鉤子
const { isVisible, openDialog: open, cancel, submit } = useDialog<QuickStartPackages>(props as any);

// Java 版本配置映射
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

  const targetShell = javaVersions.find(v => v.value === selectedJavaVersion.value)?.shell || "./start.sh";

  if (!props.instanceId || !props.daemonId) {
    return await submit({ ...item, startCommand: targetShell });
  }

  Modal.confirm({
    title: t("確認變更環境"),
    content: `${t("確定要將啟動指令修改為")}: ${targetShell}？`,
    async onOk() {
      try {
        await updateInstanceConfig().execute({
          params: {
            daemonId: props.daemonId || "",
            uuid: props.instanceId || ""
          },
          data: {
            startCommand: targetShell
          }
        });
        message.success(t("修改成功"));
        await submit(item);
      } catch (err: any) {
        reportErrorMsg(err.message);
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
    :title="dialogTitle || t('切換 Java 版本')"
    :footer="null"
    @cancel="cancel"
  >
    <div class="java-selector-container">
      <span style="margin-right: 12px; font-weight: bold;">{{ t('選擇 Java 版本') }}:</span>
      <a-select v-model:value="selectedJavaVersion" style="width: 200px">
        <a-select-option v-for="opt in javaVersions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </a-select-option>
      </a-select>
    </div>
    <AppPackages
      ref="appPackages"
      :btn-text="btnText"
      :title="dialogTitle"
      @handle-select-template="handleSelectTemplate"
    />
  </a-modal>
</template>

<style scoped>
.java-selector-container {
  padding: 20px;
  background: #f5f5f5;
  border-radius: 4px;
  margin-bottom: 10px;
}
</style>
