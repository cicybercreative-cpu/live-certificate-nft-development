export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS && import.meta.env.VITE_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000")
  ? import.meta.env.VITE_CONTRACT_ADDRESS 
  : (typeof window !== 'undefined' ? localStorage.getItem('deployedContractAddress') || "0x0000000000000000000000000000000000000000" : "0x0000000000000000000000000000000000000000");

export const CONTRACT_ABI = [
  "function safeMint(address to, string memory uri) public",
  "function safeTransferFrom(address from, address to, uint256 tokenId) public",
  "function setTokenURI(uint256 tokenId, string memory newUri) public",
  "function burnByAdmin(uint256 tokenId) public",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function totalSupply() public view returns (uint256)",
  "function tokenURI(uint256 tokenId) public view returns (string memory)",
  "function ownerOf(uint256 tokenId) public view returns (address)",
  "function tokenByIndex(uint256 index) public view returns (uint256)"
];
