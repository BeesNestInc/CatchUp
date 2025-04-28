<script>
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { sendMessage, fetchLogs } from "$lib/api";
  import { marked } from "marked"; // Markdownを適用

  let message = "";
  let loading = false;
  let chatBox;
  let currentSession = writable([]);

  // 初回マウント時にログをロード
  onMount(async () => {
    let logs = await fetchLogs();
    currentSession.set(logs);
    scrollToBottom();
  });

  async function handleSendMessage() {
    if (message.trim() === "" || loading) return;

    // ユーザーのメッセージを追加
    currentSession.update(session => [...session, { role: "user", text: message }]);

    loading = true;
    let response = await sendMessage(message);

    // APIのレスポンスを追加
    currentSession.update(session => [...session, { role: "assistant", text: response }]);

    message = "";
    loading = false;
    scrollToBottom();
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (chatBox) {
        chatBox.lastElementChild?.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  }
</script>

<main>
  <section>
    <h2>チャット</h2>
    <div bind:this={chatBox} class="chat-box">
      {#each $currentSession as msg}
        <div class="{msg.role}">
          <strong>{msg.role}:</strong>
          <div>{@html marked(msg.text)}</div>
        </div>
      {/each}
    </div>

    <textarea bind:value={message} placeholder="メッセージを入力..." rows="3"></textarea>
    <button on:click={handleSendMessage} disabled={loading}>
      {#if loading}送信中...{:else}送信{/if}
    </button>
  </section>
</main>

<style>
  main { display: flex; flex-direction: column; align-items: center; padding: 20px; }
  section { width: 100%; max-width: 600px; }
  .chat-box { 
    height: 600px; 
    overflow-y: auto; 
    border: 1px solid #ddd; 
    padding: 10px; 
    margin-bottom: 10px;
  }
  textarea {
    height: 200px;
    width: 100%; 
    padding: 10px; 
    resize: vertical; 
    margin-bottom: 10px;
  }
  button { 
    padding: 10px 20px; 
  }
  .user { color: blue; }
  .assistant { color: green; }
  .chat-box div { margin-bottom: 10px; }
</style>
