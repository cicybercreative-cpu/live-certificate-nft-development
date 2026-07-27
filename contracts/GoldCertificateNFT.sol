// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GoldCertificateNFT
 * @dev Kontrak pintar untuk mencetak NFT Bukti Kepemilikan Emas.
 * Menggunakan standar ERC721 dengan Enumerable dan URI Storage.
 */
contract GoldCertificateNFT is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable {
    // Pengganti Counters
    uint256 private _nextTokenId;

    constructor(address initialOwner) 
        ERC721("Gold Certificate", "GOLD") 
        Ownable(initialOwner) 
    {}

    function safeMint(address to, string memory uri) public onlyOwner {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    // =====================================================================
    // Fungsi untuk Admin atau Pemilik Token memperbarui URI (Metadata/Nama Baru)
    // =====================================================================
    function setTokenURI(uint256 tokenId, string memory newUri) public {
        address tokenOwner = ownerOf(tokenId);
        require(msg.sender == owner() || msg.sender == tokenOwner, "Bukan owner contract atau pemilik Token");
        _setTokenURI(tokenId, newUri);
    }

    // =====================================================================
    // Fungsi untuk Admin membakar (menghapus) token yang sudah dicetak
    // =====================================================================
    function burnByAdmin(uint256 tokenId) public onlyOwner {
        _burn(tokenId);
    }

    // =====================================================================
    // Fungsi Override wajib dari Solidity ketika mewarisi multiple contract
    // =====================================================================

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
