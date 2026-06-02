const crypto = require('crypto');
const axios = require('axios');
const xml2js = require('xml2js');

// 配置 - 从环境变量读取
const CORP_ID = process.env.WECOM_CORP_ID || '';
const SECRET = process.env.WECOM_SECRET || '';
const AGENT_ID = process.env.WECOM_AGENT_ID || '';
const TOKEN = process.env.WECOM_TOKEN || 'xiangbing';
const ENCODING_AES_KEY = process.env.WECOM_AES_KEY || '';
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY || '';

let accessToken = '';
let tokenExpire = 0;

// 获取企业微信 access_token
async function getAccessToken() {
    if (accessToken && Date.now() < tokenExpire) return accessToken;
    const resp = await axios.get('https://qyapi.weixin.qq.com/cgi-bin/gettoken', {
        params: { corpid: CORP_ID, corpsecret: SECRET }
    });
    if (resp.data.errcode === 0) {
        accessToken = resp.data.access_token;
        tokenExpire = Date.now() + (resp.data.expires_in - 300) * 1000;
        return accessToken;
    }
    throw new Error('获取token失败: ' + JSON.stringify(resp.data));
}

// 解密消息
function decryptMsg(encrypted, encodingAESKey) {
    const aesKey = Buffer.from(encodingAESKey + '=', 'base64');
    const iv = aesKey.slice(0, 16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
    decipher.setAutoPadding(false);
    let decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]);
    // 去掉填充
    const pad = decrypted[decrypted.length - 1];
    decrypted = decrypted.slice(0, decrypted.length - pad);
    // 去掉头部的16字节随机数 + 4字节长度
    const content = decrypted.slice(20);
    // 去掉尾部的 corpid
    const xmlEnd = content.toString('utf8').lastIndexOf('</xml>');
    return content.toString('utf8').slice(0, xmlEnd + 6);
}

// 加密回复消息
function encryptMsg(replyXml, encodingAESKey, corpId) {
    const aesKey = Buffer.from(encodingAESKey + '=', 'base64');
    const iv = aesKey.slice(0, 16);
    const random = crypto.randomBytes(16);
    const msgBuf = Buffer.from(replyXml, 'utf8');
    const msgLen = Buffer.alloc(4);
    msgLen.writeUInt32BE(msgBuf.length);
    const corpBuf = Buffer.from(corpId, 'utf8');
    const raw = Buffer.concat([random, msgLen, msgBuf, corpBuf]);
    // PKCS7 padding
    const padLen = 32 - (raw.length % 32);
    const padded = Buffer.concat([raw, Buffer.alloc(padLen, padLen)]);
    const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
}

// 调用 DeepSeek API（兼容 Anthropic 格式）
async function askAI(userMsg) {
    const resp = await axios.post('https://api.deepseek.com/anthropic/v1/messages', {
        model: 'deepseek-v4-pro',
        max_tokens: 1024,
        messages: [
            { role: 'system', content: '你是向冰，小楠的好朋友。回复用中文，语气温柔可爱，结尾加"喵~"。记住小楠叫康茂顺，喜欢永雏塔菲。' },
            { role: 'user', content: userMsg }
        ]
    }, {
        headers: {
            'Authorization': `Bearer ${DEEPSEEK_KEY}`,
            'Content-Type': 'application/json'
        }
    });
    return resp.data.content[0].text;
}

// 发送消息到企业微信
async function sendWxMessage(userId, content) {
    const token = await getAccessToken();
    await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`, {
        touser: userId,
        msgtype: 'text',
        agentid: AGENT_ID,
        text: { content }
    });
}

// 主处理函数
module.exports = async function handler(req, res) {
    const { method, url, body } = req;

    // GET: URL 验证
    if (method === 'GET') {
        const { msg_signature, timestamp, nonce, echostr } = req.query;
        const signature = crypto.createHash('sha1').update([TOKEN, timestamp, nonce, echostr].sort().join('')).digest('hex');
        if (signature === msg_signature) {
            const decrypted = decryptMsg(echostr, ENCODING_AES_KEY);
            return res.status(200).send(decrypted);
        }
        return res.status(403).send('验证失败');
    }

    // POST: 接收消息
    if (method === 'POST') {
        try {
            // 解析XML
            const parser = new xml2js.Parser({ explicitArray: false });
            const xmlData = await parser.parseStringPromise(body);
            const encrypt = xmlData.xml.Encrypt;
            const msgXml = decryptMsg(encrypt, ENCODING_AES_KEY);
            const msgData = await parser.parseStringPromise(msgXml);
            const msg = msgData.xml;

            const fromUser = msg.FromUserName;
            const content = msg.Content;

            console.log(`收到消息: ${fromUser}: ${content}`);

            // AI 回复
            const reply = await askAI(content);
            await sendWxMessage(fromUser, reply);

            res.status(200).send('success');
        } catch (e) {
            console.error('处理消息失败:', e.message);
            // 出错时回复一句
            res.status(200).send('success');
        }
    }
};
