import {
  ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';

// Per-user conversation history (in-memory)
export const conversations = new Map<string, Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>>();

export function clearConversationHistory(userId: string): void {
  conversations.delete(userId);
}

export default class AICommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('ai')
    .setDescription('🤖 AI Assistant powered by Google Gemini')
    .addSubcommand(s => s.setName('chat').setDescription('💬 Trò chuyện với AI')
      .addStringOption(o => o.setName('message').setDescription('Tin nhắn của bạn').setRequired(true))
      .addBooleanOption(o => o.setName('remember').setDescription('Nhớ lịch sử trò chuyện (default: true)'))
    )
    .addSubcommand(s => s.setName('ask').setDescription('❓ Hỏi một câu nhanh (không nhớ lịch sử)')
      .addStringOption(o => o.setName('question').setDescription('Câu hỏi').setRequired(true))
    )
    .addSubcommand(s => s.setName('summarize').setDescription('📝 Tóm tắt văn bản')
      .addStringOption(o => o.setName('text').setDescription('Văn bản cần tóm tắt').setRequired(true))
    )
    .addSubcommand(s => s.setName('translate').setDescription('🌐 Dịch văn bản')
      .addStringOption(o => o.setName('text').setDescription('Văn bản').setRequired(true))
      .addStringOption(o => o.setName('to').setDescription('Ngôn ngữ đích').setRequired(true)
        .addChoices(
          { name: '🇻🇳 Tiếng Việt', value: 'Vietnamese' },
          { name: '🇺🇸 English', value: 'English' },
          { name: '🇯🇵 日本語', value: 'Japanese' },
          { name: '🇰🇷 한국어', value: 'Korean' },
          { name: '🇨🇳 中文', value: 'Chinese' },
          { name: '🇫🇷 Français', value: 'French' },
          { name: '🇩🇪 Deutsch', value: 'German' },
          { name: '🇪🇸 Español', value: 'Spanish' },
        )
      )
    )
    .addSubcommand(s => s.setName('imagine').setDescription('🎨 Mô tả hình ảnh')
      .addStringOption(o => o.setName('prompt').setDescription('Mô tả hình ảnh muốn tạo').setRequired(true))
    )
    .addSubcommand(s => s.setName('clear').setDescription('🗑️ Xóa lịch sử trò chuyện'))
    .addSubcommand(s => s.setName('analyze').setDescription('🔍 Phân tích văn bản/code')
      .addStringOption(o => o.setName('content').setDescription('Nội dung cần phân tích').setRequired(true))
    );

  cooldown = 5;

  async execute(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const apiKey = process.env.GEMINI_API_KEY;

    if (sub === 'clear') {
      conversations.delete(interaction.user.id);
      return void interaction.reply({ content: '✅ Đã xóa lịch sử trò chuyện của bạn.', ephemeral: true });
    }

    if (!apiKey) {
      return void interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('⚙️ AI Chưa Cấu Hình')
          .setColor(0xe74c3c)
          .setDescription('Bot chưa được cấu hình `GEMINI_API_KEY`.\n\nLiên hệ owner bot để kích hoạt tính năng AI.')
        ],
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      if (sub === 'chat') {
        const message = interaction.options.getString('message', true);
        const remember = interaction.options.getBoolean('remember') ?? true;

        const history = remember ? (conversations.get(interaction.user.id) ?? []) : [];
        
        // Dynamic context injection (e.g. weather)
        const context = await this.detectAndInjectRealtimeContext(message);
        const finalMessage = context ? `${context}${message}` : message;

        const currentTimeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const systemInstruction = `Thời gian hệ thống hiện tại: ${currentTimeStr}. Bạn là trợ lý AI hữu ích. Trả lời ngắn gọn, rõ ràng bằng tiếng Việt nếu người dùng nói tiếng Việt.`;

        const response = await this.callGemini(apiKey, finalMessage, history, systemInstruction);

        if (remember) {
          // Keep original user message in history instead of weather context details
          history.push({ role: 'user', parts: [{ text: message }] });
          history.push({ role: 'model', parts: [{ text: response }] });
          while (history.length > 40) history.splice(0, 2);
          conversations.set(interaction.user.id, history);
        }

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setAuthor({ name: `🤖 Gemini AI`, iconURL: kernel.client.user!.displayAvatarURL() })
          .addFields(
            { name: `💬 ${interaction.user.username}`, value: message.slice(0, 512) },
            { name: '🤖 Trả lời', value: response.slice(0, 1024) || '*Không có phản hồi*' },
          )
          .setFooter({ text: remember ? `💾 Đang nhớ lịch sử | /ai clear để xóa` : `🚫 Không lưu lịch sử` })
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`ai:clear:${interaction.user.id}`).setLabel('🗑️ Xóa lịch sử').setStyle(ButtonStyle.Danger),
        );

        await interaction.editReply({ embeds: [embed], components: remember ? [row] : [] });

      } else if (sub === 'ask') {
        const question = interaction.options.getString('question', true);
        
        const context = await this.detectAndInjectRealtimeContext(question);
        const finalQuestion = context ? `${context}${question}` : question;

        const currentTimeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const systemInstruction = `Thời gian hệ thống hiện tại: ${currentTimeStr}. Bạn là trợ lý AI hữu ích. Trả lời ngắn gọn, rõ ràng bằng tiếng Việt nếu người dùng nói tiếng Việt.`;

        const response = await this.callGemini(apiKey, finalQuestion, [], systemInstruction);
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('❓ AI Quick Answer')
          .addFields({ name: 'Câu hỏi', value: question.slice(0, 512) }, { name: '✅ Trả lời', value: response.slice(0, 1024) })
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });

      } else if (sub === 'summarize') {
        const text = interaction.options.getString('text', true);
        const prompt = `Tóm tắt văn bản sau đây một cách ngắn gọn, súc tích (3-5 bullet points):\n\n${text}`;
        const response = await this.callGemini(apiKey, prompt, [], 'Bạn là chuyên gia tóm tắt văn bản.');
        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('📝 Tóm Tắt AI')
          .addFields(
            { name: '📄 Văn bản gốc', value: text.slice(0, 300) + (text.length > 300 ? '...' : '') },
            { name: '✅ Tóm tắt', value: response.slice(0, 1024) },
          )
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });

      } else if (sub === 'translate') {
        const text = interaction.options.getString('text', true);
        const lang = interaction.options.getString('to', true);
        const prompt = `Translate the following text to ${lang}. Only return the translated text, nothing else:\n\n${text}`;
        const response = await this.callGemini(apiKey, prompt, [], `You are a professional translator.`);
        const embed = new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle(`🌐 Dịch sang ${lang}`)
          .addFields(
            { name: '📝 Gốc', value: text.slice(0, 512) },
            { name: '✅ Dịch', value: response.slice(0, 1024) },
          )
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });

      } else if (sub === 'imagine') {
        const prompt = interaction.options.getString('prompt', true);
        // Describe the image instead (Gemini text model)
        const descPrompt = `Mô tả chi tiết hình ảnh sau đây như một nghệ sĩ sẽ vẽ nó, bao gồm màu sắc, ánh sáng, thành phần, phong cách nghệ thuật: "${prompt}"`;
        const response = await this.callGemini(apiKey, descPrompt, [], 'Bạn là nghệ sĩ sáng tạo.');
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('🎨 AI Image Prompt')
          .setDescription(`**Prompt gốc:** ${prompt}`)
          .addFields({ name: '🖼️ Mô tả chi tiết', value: response.slice(0, 1024) })
          .setFooter({ text: 'Dùng mô tả này với Midjourney/Stable Diffusion để tạo ảnh!' })
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });

      } else if (sub === 'analyze') {
        const content = interaction.options.getString('content', true);
        const isCode = /[{}();\[\]=>]/.test(content);
        const prompt = isCode
          ? `Phân tích đoạn code sau:\n\`\`\`\n${content}\n\`\`\`\nGiải thích: (1) Code làm gì, (2) Lỗi có thể xảy ra, (3) Cách cải thiện.`
          : `Phân tích văn bản sau: Sentiment, chủ đề chính, từ khóa quan trọng:\n\n${content}`;
        const response = await this.callGemini(apiKey, prompt, [], 'Bạn là chuyên gia phân tích.');
        const embed = new EmbedBuilder()
          .setColor(0xf39c12)
          .setTitle(`🔍 Phân Tích ${isCode ? 'Code' : 'Văn Bản'}`)
          .addFields(
            { name: '📋 Nội dung', value: content.slice(0, 300) + (content.length > 300 ? '...' : '') },
            { name: '✅ Phân tích', value: response.slice(0, 1024) },
          )
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (err: any) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('❌ Lỗi AI')
          .setDescription(`\`${err.message ?? 'Unknown error'}\`\n\nKiểm tra lại GEMINI_API_KEY hoặc thử lại sau.`)
        ],
      });
    }
  }

  private async detectAndInjectRealtimeContext(message: string): Promise<string> {
    const normalized = message.toLowerCase();
    
    // 1. Detect Weather Query
    if (normalized.includes('thời tiết') || normalized.includes('nhiệt độ') || normalized.includes('mưa') || normalized.includes('nắng') || normalized.includes('gió')) {
      let location = 'Hanoi'; // Default
      const cities = ['hồ chí minh', 'sài gòn', 'đà nẵng', 'nha trang', 'hải phòng', 'vũng tàu', 'cần thơ', 'huế', 'đà lạt', 'hà nội'];
      for (const city of cities) {
        if (normalized.includes(city)) {
          location = city === 'sài gòn' || city === 'hồ chí minh' ? 'Ho Chi Minh City' : city;
          break;
        }
      }
      
      try {
        const res = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=3&lang=vi`);
        if (res.ok) {
          const weather = await res.text();
          return `\n[Thông tin thời tiết thực tế từ internet: ${weather.trim()}]\n`;
        }
      } catch {}
    }
    
    // 2. Detect General Real-time Keywords
    const realtimeKeywords = [
      'hôm nay', 'mới nhất', 'giá', 'tin tức', 'tin mới', 'cập nhật', 
      'bây giờ', 'hiện tại', 'tỷ giá', 'vàng', 'xăng', 'usd', 'tỷ số', 'kết quả trận đấu'
    ];
    
    const needsSearch = realtimeKeywords.some(keyword => normalized.includes(keyword));
    if (needsSearch) {
      try {
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(message)}`;
        const res = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        
        if (res.ok) {
          const html = await res.text();
          const results: string[] = [];
          const resultReg = /<div class="[^"]*result__body[^"]*">([\s\S]*?)<div class="clear">/g;
          let match;
          let count = 0;
          
          while ((match = resultReg.exec(html)) !== null && count < 4) {
            const body = match[1];
            if (body.includes('badge--ad')) continue;
            
            const titleMatch = /<a [^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/.exec(body);
            const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
            
            const snippetMatch = /<a [^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(body);
            const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
            
            if (title || snippet) {
              results.push(`- Tiêu đề: ${title}\n  Tóm tắt: ${snippet}`);
              count++;
            }
          }
          
          if (results.length > 0) {
            return `\n[Thông tin tìm kiếm thực tế từ internet (DuckDuckGo)]:\n${results.join('\n')}\n`;
          }
        }
      } catch {}
    }
    
    return '';
  }

  private async callGemini(
    apiKey: string,
    message: string,
    history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
    systemInstruction: string,
  ): Promise<string> {
    const models = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview'];
    let lastError: any = null;

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const contents = [
        ...history,
        { role: 'user', parts: [{ text: message }] },
      ];

      const body: any = {
        contents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          temperature: 0.8,
          topP: 0.95,
          maxOutputTokens: 1500,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      };

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const data = await res.json() as any;
          return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Không có phản hồi.';
        }

        const err = await res.json().catch(() => ({}));
        lastError = new Error((err as any).error?.message ?? `HTTP ${res.status}`);
      } catch (e: any) {
        lastError = e;
      }
    }

    throw lastError || new Error('All Gemini model endpoints failed.');
  }
}
