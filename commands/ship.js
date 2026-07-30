module.exports = {
  name: "ship",
  description: "Randomly ship two members of the group together, e.g. !ship",
  async execute({ sock, jid, msg, getGroupMetadata }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    const metadata = await getGroupMetadata(jid);
    const participants = metadata.participants
      .map((p) => p.id)
      .filter((id) => id !== sock.user?.id);

    if (participants.length < 2) {
      return sock.sendMessage(jid, { text: "Not enough members in this group to ship!" });
    }

    const first = participants[Math.floor(Math.random() * participants.length)];
    let second;
    do {
      second = participants[Math.floor(Math.random() * participants.length)];
    } while (second === first);

    const percent = Math.floor(Math.random() * 101);
    const mention = (id) => `@${id.split("@")[0]}`;

    await sock.sendMessage(
      jid,
      {
        text: `💘 ${mention(first)} ❤️ ${mention(second)}\nCompatibility: ${percent}%\nCongratulations! 🍻`,
        mentions: [first, second],
      },
      { quoted: msg }
    );
  },
};
