/**
 * Serviço de Imagens Contextuais de Alta Definição para MegaEBD Slides AI
 */

// Galeria Curada de Imagens Bíblicas em Alta Definição (Unsplash 4K)
export const BIBLICAL_IMAGE_GALLERY = [
  {
    id: 'paulo-jerusalem',
    displayTitle: 'Paulo em Jerusalém / Soldados',
    url: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=80',
    tags: ['paulo', 'jerusalem', 'historia', 'prisao', 'soldados']
  },
  {
    displayTitle: 'Templo / Ruínas Antigas de Jerusalém',
    id: 'templo-jerusalem',
    url: 'https://images.unsplash.com/photo-1519817650390-64a93db51149?auto=format&fit=crop&w=1200&q=80',
    tags: ['templo', 'jerusalem', 'ruinas', 'israel', 'antigo']
  },
  {
    displayTitle: 'Bíblia Sagrada Aberta & Luz',
    id: 'biblia-aberta',
    url: 'https://images.unsplash.com/photo-1507434965515-61970f2bd7c6?auto=format&fit=crop&w=1200&q=80',
    tags: ['biblia', 'palavra', 'luz', 'estudo', 'ebd']
  },
  {
    displayTitle: 'Pergaminhos Antigos / Manuscritos',
    id: 'pergaminho-antigo',
    url: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=1200&q=80',
    tags: ['pergaminho', 'manuscrito', 'cartas', 'historia', 'teologia']
  },
  {
    displayTitle: 'Mar da Galileia / Paisagem Bíblica',
    id: 'galileia-paisagem',
    url: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1200&q=80',
    tags: ['galileia', 'mar', 'paisagem', 'jesus', 'natureza']
  },
  {
    displayTitle: 'Cruz no Pôr do Sol / Fé & Salvação',
    id: 'cruz-por-do-sol',
    url: 'https://images.unsplash.com/photo-1508672019048-805479767746?auto=format&fit=crop&w=1200&q=80',
    tags: ['cruz', 'salvacao', 'fe', 'jesus', 'calvario']
  },
  {
    displayTitle: 'Estudo Bíblico em Grupo / Classe EBD',
    id: 'estudo-grupo',
    url: 'https://images.unsplash.com/photo-1529070538774-1843cb3265df?auto=format&fit=crop&w=1200&q=80',
    tags: ['estudo', 'grupo', 'classe', 'comunhao', 'ebd']
  }
];

export function generateCanvasPlaceholder(title: string, promptText?: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');

  if (!ctx) return '';

  // Fundo com degradê elegante
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(0.5, '#1e1b4b');
  gradient.addColorStop(1, '#311042');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Moldura decorativa em Ouro
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.strokeRect(15, 15, canvas.width - 30, canvas.height - 30);

  // Título em Ouro
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 24px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('📖 MEGA EBD SLIDES', canvas.width / 2, 70);

  // Título da cena
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  const displayTitle = title.length > 45 ? title.substring(0, 42) + '...' : title;
  ctx.fillText(displayTitle, canvas.width / 2, canvas.height / 2 - 15);

  // Prompt / Descrição
  if (promptText) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'italic 13px sans-serif';
    const cleanPrompt = promptText.length > 65 ? promptText.substring(0, 62) + '...' : promptText;
    ctx.fillText(`"${cleanPrompt}"`, canvas.width / 2, canvas.height / 2 + 30);
  }

  // Rodapé
  ctx.fillStyle = '#38bdf8';
  ctx.font = '12px sans-serif';
  ctx.fillText('Ilustração Teológica Contextual', canvas.width / 2, canvas.height - 40);

  return canvas.toDataURL('image/png');
}

/**
 * Gera URL de imagem por IA via Pollinations ou seleciona da Galeria Curada.
 */
export async function generateAiImage(prompt: string, titleHint: string): Promise<string> {
  if (!prompt || prompt.trim() === '') {
    return BIBLICAL_IMAGE_GALLERY[0].url;
  }

  // Tenta encontrar uma imagem temática correspondente na Galeria Curada
  const lowerPrompt = (prompt + ' ' + titleHint).toLowerCase();
  for (const item of BIBLICAL_IMAGE_GALLERY) {
    if (item.tags.some(tag => lowerPrompt.includes(tag))) {
      return item.url;
    }
  }

  // Gera via Pollinations AI (sem validação HEAD bloqueada por CORS)
  const encodedPrompt = encodeURIComponent(`${prompt}, high resolution biblical historical illustration, detailed lighting, photorealistic, 4k`);
  const seed = Math.floor(Math.random() * 10000);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=500&nologo=true&seed=${seed}`;
}
