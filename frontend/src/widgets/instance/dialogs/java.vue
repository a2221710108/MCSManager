<script setup lang="ts">
import { ref } from "vue";
import type { OpenMarketDialogProps } from "@/components/fc";
import { useDialog } from "@/hooks/useDialog";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import { Modal, message } from "ant-design-vue";

// 定義 Props 接口，確保類型清晰
interface Props extends OpenMarketDialogProps {
  instanceId?: string;
  daemonId?: string;
}

const props = defineProps<Props>();
const { isVisible, openDialog: open, cancel, submit } = useDialog<any>(props as any);

const selectedJavaVersion = ref<string>("17");
const javaVersions = [
  { label: "Java 8", value: "8", shell: "./start_8_mc.sh" },
  { label: "Java 17", value: "17", shell: "./start_17_mc.sh" },
  { label: "Java 21", value: "21", shell: "./start_21_mc.sh" },
];

const handleConfirm = async () => {
  const versionObj = javaVersions.find(v => v.value === selectedJavaVersion.value);
  const targetShell = versionObj?.shell || "./start.sh";

  // 1. 安全檢查：如果 ID 不存在則中斷
  if (!props.instanceId || !props.daemonId) {
    return reportErrorMsg("實例 ID 或 節點 ID 丟失，無法操作。");
  }

  Modal.confirm({
    title: t("確認變更 Java 版本"),
    content: `${t("確定要將啟動指令更改為")} ${targetShell} ${t("嗎？")}`,
    async onOk() {
      try {
        // 2. 使用 (execute as any) 繞過前端 API 定義中對 startCommand 的類型限制
        // 3. 確保傳遞給 params 的值是 string 而不是 undefined
        await (updateInstanceConfig().execute as any)({
          params: {
            uuid: props.instanceId as string,
            daemonId: props.daemonId as string
          },
          data: {
            startCommand: targetShell
          }
        });
        
        message.success(t("配置更新成功！請重啟實例生效。"));
        await submit(true);
      } catch (err: any) {
        return reportErrorMsg(err.message);
      }
    }
  });
};

defineExpose({ openDialog: async () => await open() });
</script>

<template>
  <a-modal v-model:open="isVisible" centered :title="t('切換 Java 運行環境')" :footer="null" width="400px">
    <div class="java-selector">
      <p>{{ t('請選擇實例需要的 Java 版本：') }}</p>
      <a-select v-model:value="selectedJavaVersion" style="width: 100%">
        <a-select-option v-for="opt in javaVersions" :key="opt.value" :value="opt.value">
          {{ opt.label }} ({{ opt.shell }})
        </a-select-option>
      </a-select>
      <div class="btns">
        <a-button @click="cancel">{{ t('取消') }}</a-button>
        <a-button type="primary" @click="handleConfirm">{{ t('立即應用') }}</a-button>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.java-selector { padding: 10px; }
.btns { margin-top: 24px; text-align: right; }
.btns button { margin-left: 8px; }
</style>
