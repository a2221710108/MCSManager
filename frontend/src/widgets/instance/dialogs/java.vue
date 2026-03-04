<script setup lang="ts">
import type { OpenMarketDialogProps } from "@/components/fc";
import { useDialog } from "@/hooks/useDialog";
import { t } from "@/lang/i18n";
import { reinstallInstance } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { MountComponent, QuickStartPackages } from "@/types";
import AppPackages from "@/widgets/setupApp/AppPackages.vue";
import { Modal } from "ant-design-vue";
import { ref } from "vue";

interface Props extends OpenMarketDialogProps, MountComponent<QuickStartPackages> {
  javaVersions: string[];
}

const props = defineProps<Props>();

const { isVisible, openDialog: open, cancel, submit } = useDialog<QuickStartPackages>(props);

const openDialog = async () => {
  appPackages.value?.init();
  return await open();
};

const appPackages = ref<InstanceType<typeof AppPackages>>();
const selectedJavaVersion = ref<string>(''); // 新增Java版本选择状态

const handleSelectTemplate = async (item: QuickStartPackages | null) => {
  if (!item) {
    return submit(undefined);
  }

  // 根据Java版本生成启动命令
  const startCommand = `./start_${selectedJavaVersion.value}_mc.sh`;

  if (!props.autoInstall || !props.instanceId || !props.daemonId) {
    await submit({ ...item, startCommand });
    return;
  } else {
    Modal.confirm({
      title: t("TXT_CODE_617ce69c"),
      content: t("TXT_CODE_94f1ba3"),
      okText: t("TXT_CODE_ed3fc23"),
      async onOk() {
        try {
          await reinstallInstance().execute({
            params: {
              daemonId: props.daemonId || "",
              uuid: props.instanceId || ""
            },
            data: {
              targetUrl: item.targetLink,
              title: item.title,
              description: item.description,
              startCommand // 传递启动命令
            }
          });
          await submit({ ...item, startCommand });
        } catch (err: any) {
          console.error(err);
          return reportErrorMsg(err.message);
        }
      }
    });
  }
};

defineExpose({
  openDialog
});
</script>

<template>
  <a-modal
    v-model:open="isVisible"
    centered
    width="1600px"
    :cancel-text="t('TXT_CODE_3b1cc020')"
    :mask-closable="false"
    :confirm-loading="false"
    :footer="null"
    @cancel="cancel"
  >
    <div class="java-version-selector">
      <label>{{ t('TXT_CODE_javaVersion') }}</label>
      <a-select
        v-model:value="selectedJavaVersion"
        :options="props.javaVersions.map(version => ({ label: version, value: version }))"
      />
    </div>
    
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
.java-version-selector {
  margin-bottom: 20px;
}
</style>
