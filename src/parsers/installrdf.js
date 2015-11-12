import { ADDON_TYPE_MAP, INSTALL_RDF } from 'const';
import { TYPE_INVALID, TYPE_MISSING } from 'messages';
import log from 'logger';
import RDFScanner from 'scanners/rdf';


export default class InstallRdfParser {

  constructor(rdfString, collector) {
    this.rdfString = rdfString;
    // Provides ability to directly add messages to
    // the collector.
    this.collector = collector;
  }

  parseDoc() {
    var rdfScanner = new RDFScanner(this.rdfString, INSTALL_RDF);
    return rdfScanner.getContents();
  }

  getMetaData() {
    return this.parseDoc()
      .then((xmlDoc) => {
        return Promise.resolve({
          type: this._getAddonType(xmlDoc),
        });
      });
  }

  _getAddonType(xmlDoc) {
    var addonType = null;
    var typeNodes = xmlDoc.getElementsByTagName('em:type');
    if (typeNodes.length > 1) {
      throw new Error('Multiple <em:type> elements found');
    }
    var node = typeNodes[0];
    if (node && node.firstChild && node.firstChild.nodeValue) {
      var typeValue = node.firstChild.nodeValue;
      if (!ADDON_TYPE_MAP.hasOwnProperty(typeValue)) {
        log.debug('Invalid type value "%s"', typeValue);
        this.collector.addError(TYPE_INVALID);
      } else {
        var addonType = ADDON_TYPE_MAP[typeValue];
        log.debug('Mapping original <em:type> value "%s" -> "%s"',
                  typeValue, addonType);
      }
    } else {
      log.warn('<em:type> was not found in install.rdf');
      this.collector.addNotice(TYPE_MISSING);
    }
    return addonType;
  }
}
