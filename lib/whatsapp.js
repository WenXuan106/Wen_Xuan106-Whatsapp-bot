      // Platform-agnostic ctx fields, alongside the legacy ones below —
      // commands migrated to the shared cross-platform shape (see
      // lib/telegram.js) use these; everything not yet migrated keeps
      // using sock/msg/jid directly, unaffected by this addition.
      const messageTimestampMs = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
      const platformCtx = {
        platform: "whatsapp",
        chatId: jid,
        senderId: msg.key.participant || msg.key.remoteJid,
        isGroup: jid.endsWith("@g.us"),
        text,
        messageTimestampMs,
        async sendText(msgText) {
          return newSock.sendMessage(jid, { text: msgText }, { quoted: msg });
        },
        async sendImage(source, caption) {
          const image = Buffer.isBuffer(source) ? source : { url: source };
          return newSock.sendMessage(jid, { image, caption }, { quoted: msg });
        },
        async sendSticker(buffer) {
          return newSock.sendMessage(jid, { sticker: buffer }, { quoted: msg });
        },
        async reply(msgText) {
          return newSock.sendMessage(jid, { text: msgText }, { quoted: msg });
        },
      };

      try {
        await command.execute({
          sock: newSock,
          msg,
          jid,
          args,
          commands,
          getGroupMetadata: (groupJid, opts) => getGroupMetadata(newSock, groupJid, opts),
          ...platformCtx,
        });
