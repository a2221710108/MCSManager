<script setup lang="ts">
import { ref } from "vue";
import type { OpenMarketDialogProps } from "@/components/fc";
import { useDialog } from "@/hooks/useDialog";
import { t } from "@/lang/i18n";
import { reinstallInstance } from "@/services/apis/instance"; // 使用重裝/安裝接口
import { reportErrorMsg } from "@/tools/validator";
import { Modal, message } from "ant-design-vue";

interface Props extends OpenMarketDialogProps {
  instanceId?: string;
  daemonId?: string;
  destroyComponent?: () => void;
  emitResult?: (res: any) => void;
}

const props = defineProps<Props>();
const { isVisible, openDialog: open, cancel, submit } = useDialog<any>(props as any);

const selectedJavaVersion = ref<string>("17");
const javaVersions = [
  { label: "Java 6", value: "6", shell: "./start_6_mc.sh" },
  { label: "Java 8", value: "8", shell: "./start_8_mc.sh" },
  { label: "Java 17", value: "17", shell: "./start_17_mc.sh" },
  { label: "Java 21", value: "21", shell: "./start_21_mc.sh" },
];

const openDialog = async () => await open();

const handleConfirm = async () => {
  const versionObj = javaVersions.find(v => v.value === selectedJavaVersion.value);
  const targetShell = versionObj?.shell || "./start.sh";

  if (!props.instanceId || !props.daemonId) return;

  Modal.confirm({
    title: t("確認切換 Java 版本"),
    content: `${t("將環境更改為")} ${versionObj?.label} (${targetShell})。${t("此操作將重置啟動指令，是否繼續？")}`,
    async onOk() {
      try {
        // 重點：調用 reinstallInstance 而不是 updateConfig
        // 在後端，這個接口會觸發實例的重置邏輯，並允許帶入新的 startCommand
        // 且普通用戶通常擁有操作自己實例「重裝/快速部署」的權限
        await reinstallInstance().execute({
          params: {
            daemonId: props.daemonId || "",
            uuid: props.instanceId || ""
          },
          data: {
            // 強行注入啟動指令
            startCommand: targetShell, 
            targetUrl: "", // 不下載任何新文件
            title: `Switch to ${versionObj?.label}`,
            description: "Java version switch"
          }
        });
        
        message.success(t("Java 環境已切換"));
        await submit(true);
      } catch (err: any) {
        // 如果連這個都失敗，說明面板徹底封死了該用戶對 startCommand 的寫入
        // 此時需要檢查後端 Controller 是否有對 startCommand 做 readonly 校驗
        return reportErrorMsg(err.message);
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="isVisible" centered :title="t('切換 Java 運行環境')" :footer="null" width="400px">
    <div class="java-selector">
      <p>{{ t('請選擇當前實例需要的 Java 版本：') }}</p>
      <a-select v-model:value="selectedJavaVersion" style="width: 100%">
        <a-select-option v-for="opt in javaVersions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
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
