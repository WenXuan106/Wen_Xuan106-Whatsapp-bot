// Add new lines here any time — just add another string to this array,
// one sentence per entry. No other code needs to change.
const SENTENCES = [
  "WOI WOI WOI",
  "START POSTING",
  "RAYDEN ANGRY LIAO",
  "EH",
  "I CAME ALL THE WAY FROM CHINA ON TWO BICYCLE WHEEL TO SEE THIS",
  "🏞️ IS THIS A PARK OR A PLAYGROUND??",
  "AYD!!!",
  "U THINK WE SCOLD U VV HAPPY AH",
  "📢 *YALL KNOW PPL LEAVING CAUSE YALL SPAM EVERYDAY AND CHAT IS TAKING UP AROUND 1 - 10GB*",
  "SON",
  "WAH",
  "HOW ARE THERE RARITIES-",
  "SHUCKS",
  "6583774280@s.whatsapp.net using bot for a few months and no bans (the only ban is when he added 100+ ppl in a gc)",
  "JSON",
  "SQL",
  "JS",
  "TS",
  "SONION RING",
  "Record of the day",
  "YALL SPAM ONE MORE TIME LAH, I WILL SPAM THROW YOU GUYS INTO LONGKANG",
  "NONSENSE",
  "📢 *YALL SPAM SOMEMORE WE BAN YALL FROM BOT YOU WANT?*",
  "WHAT IS THIS",
  "ASH",
  "WELCOME ONBOARD OF ASH AIRLINE",
  "THIS TRAIN SERVICE ENDS HERE, ALL PASSENGERS PLEASE ALIGHT. THANK YOU FOR TRAVELLING WITH SMRT.",
  "*WHO YOU THINK YOU ARE!?*",
  "A friendly reminder to stay hydrated! Drink more water to keep yourself healthy. 💧",
  "SPAM SUMMORE",
  "BUT THIS ISNT HARRY'S WORLD OK, BUT THIS ISNT HARRY'S WORLD OK",
  "EH COME BRO",
  "📢 *YALL JUST NOW REACT WHY NOW NO REACT YALL SCARED RIGHT!?*",
];

module.exports = {
  name: "ash",
  description: "Says something random",
  async execute(ctx) {
    const line = SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
    await ctx.sendText(line);
  },
};
