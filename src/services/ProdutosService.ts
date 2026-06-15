import { ProdutosRepository } from "../repositories/ProdutosRepository.js";

export class ProdutosService {
  constructor(private repository = new ProdutosRepository()) {}

  async listarProdutosEtiqueta() {
    const rows = await this.repository.listarProdutosEtiqueta();

    return rows.map((item) => ({
      codProd: Number(item.CODPROD),
      descricao: String(item.DESCRPROD),
      qtdPc: item.AD_QTDPC != null ? Number(item.AD_QTDPC) : null,
      grupo: "Etiqueta",
    }));
  }
}