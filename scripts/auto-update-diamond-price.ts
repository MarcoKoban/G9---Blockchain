import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Script d'auto-update du prix d'un diamant (NFT) toutes les heures
 * 
 * Ce script:
 * - Tourne en continu
 * - Change le prix toutes les heures
 * - Multiplie par un facteur aléatoire entre 0.8 et 1.2
 * 
 * Usage:
 *   npx hardhat run scripts/auto-update-diamond-price.ts --network sepolia
 * 
 * Pour laisser tourner en background (PowerShell):
 *   Start-Process npx -ArgumentList "hardhat", "run", "scripts/auto-update-diamond-price.ts", "--network", "sepolia" -WindowStyle Hidden
 */

// ========== CONFIGURATION ==========

// const UPDATE_INTERVAL = 60 * 60 * 1000; // 1 heure en millisecondes (pour production)
const UPDATE_INTERVAL = 2 * 60 * 1000; // 2 minutes pour test

const MIN_MULTIPLIER = 0.8;  // Prix minimum: × 0.8 (-20%)
const MAX_MULTIPLIER = 1.2;  // Prix maximum: × 1.2 (+20%)

// ========== FONCTIONS ==========

/**
 * Générer un nombre aléatoire entre min et max
 */
function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Mettre à jour le prix d'un NFT dans l'oracle
 */
async function updateDiamondPrice(
  oracle: any,
  nft: any,
  nftAddress: string,
  tokenId: number,
  currentPrice: bigint
): Promise<bigint> {
  // Générer multiplicateur aléatoire
  const multiplier = randomBetween(MIN_MULTIPLIER, MAX_MULTIPLIER);
  
  // Calculer nouveau prix
  const newPriceFloat = Number(ethers.formatEther(currentPrice)) * multiplier;
  const newPrice = ethers.parseEther(newPriceFloat.toFixed(18));
  
  // Calculer changement en %
  const changePercent = ((multiplier - 1) * 100).toFixed(2);
  const changeSymbol = multiplier >= 1 ? "+" : "";
  
  console.log("\n" + "=".repeat(60));
  console.log("💎 MISE À JOUR DU PRIX DU DIAMANT");
  console.log("=".repeat(60));
  console.log("Heure:", new Date().toLocaleString());
  console.log("Token ID:", tokenId);
  console.log("Ancien prix:", ethers.formatEther(currentPrice), "EUR");
  console.log("Multiplicateur:", multiplier.toFixed(4));
  console.log("Nouveau prix:", ethers.formatEther(newPrice), "EUR");
  console.log("Changement:", changeSymbol + changePercent + "%");
  
  // Mettre à jour l'oracle
  console.log("\n⏳ Mise à jour de l'Oracle...");
  
  try {
    const tx = await oracle.updateNFTPrice(nftAddress, tokenId, newPrice);
    console.log("   Transaction envoyée:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("   ✅ Oracle mis à jour!");
    console.log("   Bloc:", receipt?.blockNumber);
    console.log("   Gas utilisé:", receipt?.gasUsed.toString());
    
    // NFTAssetTokenV2 n'a plus de fonction updateValuation
    // Le prix est uniquement stocké dans l'Oracle
    console.log("   ℹ️  Prix stocké dans l'Oracle uniquement (NFTAssetTokenV2 n'a pas de valuation on-chain)");
    
    console.log("\n🔗 View on Etherscan:");
    console.log("   https://sepolia.etherscan.io/tx/" + receipt?.hash);
    
    return newPrice;
    
  } catch (error: any) {
    console.error("\n❌ Erreur lors de la mise à jour:", error.message);
    return currentPrice; // Garder l'ancien prix en cas d'erreur
  }
}

/**
 * Boucle principale
 */
async function main() {
  console.log("\n💎 DIAMOND PRICE AUTO-UPDATE SCRIPT");
  console.log("=".repeat(60));
  console.log("Intervalle:", UPDATE_INTERVAL / 1000 / 60, "minutes");
  console.log("Variation:", MIN_MULTIPLIER, "à", MAX_MULTIPLIER);
  console.log("=".repeat(60));
  
  // Charger les adresses
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "localhost" : network.name;
  const deploymentsPath = path.join(
    __dirname,
    "..",
    "deployments",
    `${networkName}-addresses.json`
  );
  
  if (!fs.existsSync(deploymentsPath)) {
    console.log("❌ Fichier deployments introuvable!");
    process.exit(1);
  }
  
  const addresses = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const oracleAddress = addresses.oracle;
  
  // Utiliser NFTAssetTokenV2 (la bonne adresse)
  const nftAddress = "0x75499Fc469f8d224C7bF619Ada37ea8f3cD8c36E"; // NFTAssetTokenV2
  
  if (!oracleAddress) {
    console.log("❌ Oracle non déployé!");
    console.log("   Run: npx hardhat run scripts/deploy-oracle.ts --network", networkName);
    process.exit(1);
  }
  
  console.log("\n📋 Configuration:");
  console.log("Oracle:", oracleAddress);
  console.log("NFT Contract:", nftAddress);
  console.log("Network:", networkName);
  
  // Se connecter aux contrats
  const oracle = await ethers.getContractAt("SimplePriceOracle", oracleAddress);
  const nft = await ethers.getContractAt("NFTAssetTokenV2", nftAddress);
  
  // Vérifier quel Token ID nous allons mettre à jour
  const TOKEN_ID = 0; // ID du premier NFT (diamant) - commence à 0
  
  console.log("\n💎 Diamond NFT Token ID:", TOKEN_ID);
  
  // Vérifier si le NFT existe
  try {
    const owner = await nft.ownerOf(TOKEN_ID);
    console.log("   Owner:", owner);
    
    // NFTAssetTokenV2 n'a que tokenizationDate et isActive
    const assetData = await nft.assetData(TOKEN_ID);
    console.log("   Tokenization Date:", new Date(Number(assetData.tokenizationDate) * 1000).toLocaleDateString());
    console.log("   Is Active:", assetData.isActive);
    
    // Récupérer l'URI pour voir le nom dans la metadata
    try {
      const uri = await nft.tokenURI(TOKEN_ID);
      console.log("   URI:", uri.substring(0, 50) + "...");
    } catch (e) {
      console.log("   URI: Non disponible");
    }
  } catch (error) {
    console.log("\n⚠️  Diamond NFT Token ID", TOKEN_ID, "n'existe pas encore!");
    console.log("   Vous devez d'abord minter un diamant.");
    console.log("   Run: npx hardhat run scripts/mint-diamond.ts --network", networkName);
    process.exit(1);
  }
  
  // Obtenir le prix initial depuis l'oracle
  let currentPrice: bigint;
  
  try {
    const priceData = await oracle.nftPrices(nftAddress, TOKEN_ID);
    if (priceData.isActive && priceData.price > 0n) {
      currentPrice = priceData.price;
      console.log("\n✅ Prix dans l'Oracle:", ethers.formatEther(currentPrice), "EUR");
      console.log("   Dernière mise à jour:", new Date(Number(priceData.lastUpdate) * 1000).toLocaleString());
      console.log("   Nombre de mises à jour:", priceData.updateCount.toString());
    } else {
      throw new Error("Price not set");
    }
  } catch (error) {
    console.log("\n⚠️  Prix initial non défini dans l'Oracle!");
    
    // NFTAssetTokenV2 n'a plus de valuation on-chain, utiliser un prix par défaut
    currentPrice = ethers.parseEther("50000.0"); // 50,000 EUR par défaut pour un diamant
    
    console.log("   Initialisation du prix dans l'Oracle:", ethers.formatEther(currentPrice), "EUR");
    
    const tx = await oracle.updateNFTPrice(nftAddress, TOKEN_ID, currentPrice);
    await tx.wait();
    console.log("   ✅ Prix initial défini dans l'Oracle!");
  }
  
  console.log("\n✅ Script prêt! Mise à jour toutes les", UPDATE_INTERVAL / 1000 / 60, "minutes");
  console.log("💡 Tip: Pour tester rapidement, réduisez UPDATE_INTERVAL à 2 minutes (ligne 16)");
  console.log("⏹️  Appuyez sur Ctrl+C pour arrêter\n");
  
  // Boucle infinie
  let updateCount = 0;
  
  while (true) {
    // Attendre l'intervalle
    await new Promise(resolve => setTimeout(resolve, UPDATE_INTERVAL));
    
    // Mettre à jour le prix
    updateCount++;
    console.log("\n🔄 Mise à jour #" + updateCount);
    
    currentPrice = await updateDiamondPrice(oracle, nft, nftAddress, TOKEN_ID, currentPrice);
    
    // Afficher le statut
    const nextUpdate = new Date(Date.now() + UPDATE_INTERVAL);
    console.log("\n💤 Prochaine mise à jour prévue à:", nextUpdate.toLocaleTimeString());
    console.log("   (dans", UPDATE_INTERVAL / 1000 / 60, "minutes)");
  }
}

// Gestion propre de l'arrêt
let updateCount = 0;

process.on("SIGINT", () => {
  console.log("\n\n👋 Arrêt du script...");
  console.log("Nombre de mises à jour effectuées:", updateCount);
  process.exit(0);
});

// Lancer le script
main().catch((error) => {
  console.error("\n❌ Erreur fatale:");
  console.error(error);
  process.exit(1);
});
